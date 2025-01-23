import { DEFAULT_SEGMENT_SIZE, DEFAULT_SEGMENT_MAX_CHUNKS, DEFAULT_CHUNK_SIZE, } from '../constant.js';
import { delay, getMarketContract } from '../utils.js';
import { numSplits } from '../file/index.js';
import pkg from 'ethers';
const { encodeBase64, ethers } = pkg;
import { calculatePrice, getShardConfigs } from './utils.js';
import { checkReplica } from '../common/index.js';
export class Uploader {
    nodes;
    provider;
    flow;
    gasPrice;
    gasLimit;
    constructor(nodes, providerRpc, flow, gasPrice = BigInt('0'), gasLimit = BigInt('0')) {
        this.nodes = nodes;
        this.provider = new ethers.JsonRpcProvider(providerRpc);
        this.flow = flow;
        this.gasPrice = gasPrice;
        this.gasLimit = gasLimit;
    }
    async checkExistence(root) {
        for (let client of this.nodes) {
            let info = await client.getFileInfo(root);
            if (info !== null && info.finalized) {
                return true;
            }
        }
        return false;
    }
    async uploadFile(file, opts, retryOpts) {
        var [tree, err] = await file.merkleTree();
        if (err != null || tree == null || tree.rootHash() == null) {
            return ['', new Error('Failed to create Merkle tree')];
        }
        console.log('Data prepared to upload', 'root=' + tree.rootHash(), 'size=' + file.size(), 'numSegments=' + file.numSegments(), 'numChunks=' + file.numChunks());
        const exist = await this.checkExistence(tree.rootHash());
        if (exist) {
            return ['', new Error('Data already exists')];
        }
        var [submission, err] = await file.createSubmission(opts.tags);
        if (err !== null || submission === null) {
            return ['', new Error('Failed to create submission')];
        }
        let marketAddr = await this.flow.market();
        let marketContract = getMarketContract(marketAddr, this.provider);
        let pricePerSector = await marketContract.pricePerSector();
        let fee = BigInt('0');
        if (opts.fee > 0) {
            fee = opts.fee;
        }
        else {
            fee = calculatePrice(submission, pricePerSector);
        }
        var txOpts = {
            value: fee,
        };
        if (this.gasPrice > 0) {
            txOpts.gasPrice = this.gasPrice;
        }
        if (this.gasLimit > 0) {
            txOpts.gasLimit = this.gasLimit;
        }
        console.log('Submitting transaction with storage fee:', fee);
        let tx = await this.flow.submit(submission, txOpts);
        await tx.wait();
        let receipt = await this.waitForReceipt(this.provider, tx.hash, retryOpts);
        if (receipt === null) {
            return ['', new Error('Failed to get transaction receipt')];
        }
        console.log('Transaction hash:', tx.hash);
        let info = await this.waitForLogEntry(tree.rootHash(), false, receipt);
        if (info === null) {
            return ['', new Error('Failed to get log entry')];
        }
        const tasks = await this.segmentUpload(info, file, tree, opts);
        if (tasks === null) {
            return ['', new Error('Failed to get upload tasks')];
        }
        console.log('Processing tasks in parallel with ', tasks.length, ' tasks...');
        err = await this.processTasksInParallel(file, tree, tasks)
            .then(() => console.log('All tasks processed'))
            .catch((error) => {
            return error;
        });
        if (err !== undefined) {
            return ['', err];
        }
        return [tx.hash, null];
    }
    async waitForReceipt(provider, txHash, opts) {
        var receipt = null;
        if (opts === undefined) {
            opts = { Retries: 10, Interval: 5 };
        }
        let nTries = 0;
        while (nTries < opts.Retries) {
            receipt = await provider.getTransactionReceipt(txHash);
            if (receipt !== null && receipt.status == 1) {
                return receipt;
            }
            await delay(opts.Interval * 1000);
            nTries++;
        }
        return null;
    }
    async waitForLogEntry(root, finalityRequired, receipt) {
        console.log('Wait for log entry on storage node');
        let info = null;
        while (true) {
            await delay(1000);
            let ok = true;
            for (let client of this.nodes) {
                info = await client.getFileInfo(root);
                if (info === null) {
                    let logMsg = 'Log entry is unavailable yet';
                    if (receipt !== undefined) {
                        let status = await client.getStatus();
                        if (status !== null) {
                            const logSyncHeight = status.logSyncHeight;
                            const txBlock = receipt.blockNumber;
                            logMsg = `Log entry is unavailable yet, txBlock=${txBlock}, zgsNodeSyncHeight=${logSyncHeight}`;
                        }
                    }
                    console.log(logMsg);
                    ok = false;
                    break;
                }
                if (finalityRequired && !info.finalized) {
                    console.log('Log entry is available, but not finalized yet');
                    ok = false;
                    break;
                }
            }
            if (ok) {
                break;
            }
        }
        return info;
    }
    // Function to process all tasks in parallel
    async processTasksInParallel(file, tree, tasks) {
        const taskPromises = tasks.map((task) => this.uploadTask(file, tree, task));
        return await Promise.all(taskPromises);
    }
    async segmentUpload(info, file, tree, opts) {
        const shardConfigs = await getShardConfigs(this.nodes);
        if (shardConfigs === null) {
            console.log('Failed to get shard configs');
            return null;
        }
        if (!checkReplica(shardConfigs, opts.expectedReplica)) {
            console.log('Not enough replicas');
            return null;
        }
        let txSeq = info.tx.seq;
        let startSegmentIndex = info.tx.startEntryIndex / DEFAULT_SEGMENT_MAX_CHUNKS;
        let endSegmentIndex = (info.tx.startEntryIndex +
            numSplits(info.tx.size, DEFAULT_CHUNK_SIZE) -
            1) /
            DEFAULT_SEGMENT_MAX_CHUNKS;
        var uploadTasks = [];
        for (let clientIndex = 0; clientIndex < shardConfigs.length; clientIndex++) {
            // skip finalized nodes
            let info = await this.nodes[clientIndex].getFileInfo(tree.rootHash());
            if (info !== null && info.finalized) {
                continue;
            }
            const shardConfig = shardConfigs[clientIndex];
            var tasks = [];
            let segIndex = ((startSegmentIndex +
                shardConfig.numShard -
                1 -
                shardConfig.shardId) /
                shardConfig.numShard) *
                shardConfig.numShard +
                shardConfig.shardId;
            while (segIndex <= endSegmentIndex) {
                tasks.push({
                    clientIndex,
                    taskSize: opts.taskSize,
                    segIndex: segIndex - startSegmentIndex,
                    numShard: shardConfig.numShard,
                    txSeq,
                });
                segIndex += shardConfig.numShard * opts.taskSize;
            }
            uploadTasks.push(tasks);
        }
        var tasks = [];
        if (uploadTasks.length > 0) {
            uploadTasks.sort((a, b) => a.length - b.length);
            for (let taskIndex = 0; taskIndex < uploadTasks[0].length; taskIndex += 1) {
                for (let i = 0; i < uploadTasks.length && taskIndex < uploadTasks[i].length; i += 1) {
                    tasks.push(uploadTasks[i][taskIndex]);
                }
            }
        }
        return tasks;
    }
    async getSegment(file, tree, segIndex) {
        let numChunks = file.numChunks();
        let startSegIndex = segIndex * DEFAULT_SEGMENT_MAX_CHUNKS;
        if (startSegIndex >= numChunks) {
            return [true, null, null];
        }
        const iter = file.iterateWithOffsetAndBatch(segIndex * DEFAULT_SEGMENT_SIZE, DEFAULT_SEGMENT_SIZE, true);
        let [ok, err] = await iter.next();
        if (!ok) {
            return [false, null, err];
        }
        let segment = iter.current();
        const proof = tree.proofAt(segIndex);
        const startIndex = segIndex * DEFAULT_SEGMENT_MAX_CHUNKS;
        let allDataUploaded = false;
        if (startIndex + segment.length / DEFAULT_CHUNK_SIZE >= numChunks) {
            const expectedLen = DEFAULT_CHUNK_SIZE * (numChunks - startIndex);
            segment = segment.slice(0, expectedLen);
            allDataUploaded = true;
        }
        const segWithProof = {
            root: tree.rootHash(),
            data: encodeBase64(segment),
            index: segIndex,
            proof: proof,
            fileSize: file.size(),
        };
        return [allDataUploaded, segWithProof, null];
    }
    async uploadTask(file, tree, uploadTask) {
        let segIndex = uploadTask.segIndex;
        var segments = [];
        for (let i = 0; i < uploadTask.taskSize; i += 1) {
            let [allDataUploaded, segWithProof, err] = await this.getSegment(file, tree, segIndex);
            if (err !== null) {
                return err;
            }
            if (segWithProof !== null) {
                segments.push(segWithProof);
            }
            if (allDataUploaded) {
                break;
            }
            segIndex += uploadTask.numShard;
        }
        let res = await this.nodes[uploadTask.clientIndex].uploadSegmentsByTxSeq(segments, uploadTask.txSeq);
        if (res === null) {
            return new Error('Failed to upload segments');
        }
        return res;
    }
}
//# sourceMappingURL=Uploader.js.map
