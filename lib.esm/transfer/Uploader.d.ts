import { StorageNode, SegmentWithProof, FileInfo } from '../node/index.js';
import { FixedPriceFlow } from '../contracts/flow/FixedPriceFlow.js';
import { RetryOpts } from '../types.js';
import { MerkleTree } from '../file/index.js';
import pkg from 'ethers';
const { ethers } = pkg;
import { UploadOption, UploadTask } from './types.js';
import { AbstractFile } from '../file/AbstractFile.js';
export declare class Uploader {
    nodes: StorageNode[];
    provider: ethers.JsonRpcProvider;
    flow: FixedPriceFlow;
    gasPrice: bigint;
    gasLimit: bigint;
    constructor(nodes: StorageNode[], providerRpc: string, flow: FixedPriceFlow, gasPrice?: bigint, gasLimit?: bigint);
    checkExistence(root: string): Promise<boolean>;
    uploadFile(file: AbstractFile, opts: UploadOption, retryOpts?: RetryOpts): Promise<[string, Error | null]>;
    waitForReceipt(provider: ethers.JsonRpcProvider, txHash: string, opts?: RetryOpts): Promise<ethers.TransactionReceipt | null>;
    waitForLogEntry(root: string, finalityRequired: boolean, receipt?: ethers.TransactionReceipt): Promise<FileInfo | null>;
    processTasksInParallel(file: AbstractFile, tree: MerkleTree, tasks: UploadTask[]): Promise<(number | Error)[]>;
    segmentUpload(info: FileInfo, file: AbstractFile, tree: MerkleTree, opts: UploadOption): Promise<UploadTask[] | null>;
    getSegment(file: AbstractFile, tree: MerkleTree, segIndex: number): Promise<[boolean, SegmentWithProof | null, Error | null]>;
    uploadTask(file: AbstractFile, tree: MerkleTree, uploadTask: UploadTask): Promise<number | Error>;
}
//# sourceMappingURL=Uploader.d.ts.map
