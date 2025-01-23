import pkg from 'ethers';
const { BytesLike } = pkg;
import { MerkleTree } from './MerkleTree.js';
import { SubmissionNodeStruct, SubmissionStruct } from '../contracts/flow/FixedPriceFlow.js';
import { Iterator } from './Iterator/index.js';
export declare abstract class AbstractFile {
    fileSize: number;
    static segmentRoot(segment: Uint8Array, emptyChunksPadded?: number): string;
    size(): number;
    iterate(flowPadding: boolean): Iterator;
    abstract iterateWithOffsetAndBatch(offset: number, batch: number, flowPadding: boolean): Iterator;
    merkleTree(): Promise<[MerkleTree | null, Error | null]>;
    numChunks(): number;
    numSegments(): number;
    createSubmission(tags: BytesLike): Promise<[SubmissionStruct | null, Error | null]>;
    splitNodes(): number[];
    createNode(offset: number, chunks: number): Promise<[SubmissionNodeStruct | null, Error | null]>;
    createSegmentNode(offset: number, batch: number, size: number): Promise<[SubmissionNodeStruct | null, Error | null]>;
}
//# sourceMappingURL=AbstractFile.d.ts.map
