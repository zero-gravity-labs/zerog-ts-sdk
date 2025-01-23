import pkg from 'ethers';
const { ethers } = pkg;
export interface UploadTask {
    clientIndex: number;
    taskSize: number;
    segIndex: number;
    numShard: number;
    txSeq: number;
}
export interface UploadOption {
    tags: ethers.BytesLike;
    finalityRequired: boolean;
    taskSize: number;
    expectedReplica: number;
    skipTx: boolean;
    fee: bigint;
}
export declare var defaultUploadOption: UploadOption;
//# sourceMappingURL=types.d.ts.map
