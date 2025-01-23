import pkg from 'ethers';
const { ethers } = pkg;

export interface UploadTask {
    clientIndex: number
    taskSize: number
    segIndex: number
    numShard: number
    txSeq: number
}

export interface UploadOption {
    tags: ethers.BytesLike // transaction tags
    finalityRequired: boolean // wait for file finalized on uploaded nodes or not
    taskSize: number // number of segment to upload in single rpc request
    expectedReplica: number // expected number of replications
    skipTx: boolean // skip sending transaction on chain, this can set to true only if the data has already settled on chain before
    fee: bigint // fee to pay for data storage
}

export var defaultUploadOption: UploadOption = {
    tags: '0x',
    finalityRequired: false,
    taskSize: 1,
    expectedReplica: 1,
    skipTx: false,
    fee: BigInt(0),
}
