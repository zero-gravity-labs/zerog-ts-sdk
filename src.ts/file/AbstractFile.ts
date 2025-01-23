import pkg from 'ethers';
const { BytesLike } = pkg;
import { MerkleTree } from './MerkleTree.js'
import {
    SubmissionNodeStruct,
    SubmissionStruct,
} from '../contracts/flow/FixedPriceFlow.js'
import { Iterator } from './Iterator/index.js'
import {
    DEFAULT_CHUNK_SIZE,
    DEFAULT_SEGMENT_SIZE,
    DEFAULT_SEGMENT_MAX_CHUNKS,
    EMPTY_CHUNK_HASH,
    ZERO_HASH,
} from '../constant.js'
import { computePaddedSize, numSplits } from './utils.js'

export abstract class AbstractFile {
    fileSize: number = 0

    // constructor() {}

    // split a segment into chunks and compute the root hash
    static segmentRoot(
        segment: Uint8Array,
        emptyChunksPadded: number = 0
    ): string {
        const tree = new MerkleTree()

        const dataLength = segment.length
        for (
            let offset = 0;
            offset < dataLength;
            offset += DEFAULT_CHUNK_SIZE
        ) {
            const chunk = segment.subarray(offset, offset + DEFAULT_CHUNK_SIZE)
            tree.addLeaf(chunk)
        }

        if (emptyChunksPadded > 0) {
            for (let i = 0; i < emptyChunksPadded; i++) {
                tree.addLeafByHash(EMPTY_CHUNK_HASH)
            }
        }

        tree.build()
        if (tree.root !== null) {
            return tree.rootHash() as string
        }

        return ZERO_HASH // TODO check this
    }

    size(): number {
        return this.fileSize
    }

    iterate(flowPadding: boolean): Iterator {
        return this.iterateWithOffsetAndBatch(
            0,
            DEFAULT_SEGMENT_SIZE,
            flowPadding
        )
    }

    abstract iterateWithOffsetAndBatch(
        offset: number,
        batch: number,
        flowPadding: boolean
    ): Iterator

    async merkleTree(): Promise<[MerkleTree | null, Error | null]> {
        const iter = this.iterate(true)
        const tree = new MerkleTree()

        while (true) {
            let [ok, err] = await iter.next()
            if (err != null) {
                return [null, err]
            }

            if (!ok) {
                break
            }
            const current = iter.current()
            const segRoot = AbstractFile.segmentRoot(current)

            tree.addLeafByHash(segRoot)
        }

        return [tree.build(), null]
    }

    numChunks(): number {
        return numSplits(this.size(), DEFAULT_CHUNK_SIZE)
    }

    numSegments(): number {
        return numSplits(this.size(), DEFAULT_SEGMENT_SIZE)
    }

    async createSubmission(
        tags: BytesLike
    ): Promise<[SubmissionStruct | null, Error | null]> {
        const submission: SubmissionStruct = {
            length: this.size(),
            tags: tags,
            nodes: [],
        }

        const nodes = this.splitNodes()
        let offset = 0
        for (let chunks of nodes) {
            let [node, err] = await this.createNode(offset, chunks)
            if (err != null) {
                return [null, err]
            }
            submission.nodes.push(node as SubmissionNodeStruct)
            offset += chunks * DEFAULT_CHUNK_SIZE
        }

        return [submission, null]
    }

    splitNodes(): number[] {
        let nodes: number[] = []

        let chunks = this.numChunks()
        let [paddedChunks, chunksNextPow2] = computePaddedSize(chunks)
        let nextChunkSize = chunksNextPow2

        while (paddedChunks > 0) {
            if (paddedChunks >= nextChunkSize) {
                paddedChunks -= nextChunkSize
                nodes.push(nextChunkSize)
            }
            nextChunkSize /= 2
        }
        return nodes
    }

    async createNode(
        offset: number,
        chunks: number
    ): Promise<[SubmissionNodeStruct | null, Error | null]> {
        let batch = chunks
        if (chunks > DEFAULT_SEGMENT_MAX_CHUNKS) {
            batch = DEFAULT_SEGMENT_MAX_CHUNKS
        }

        return this.createSegmentNode(
            offset,
            DEFAULT_CHUNK_SIZE * batch,
            DEFAULT_CHUNK_SIZE * chunks
        )
    }

    async createSegmentNode(
        offset: number,
        batch: number,
        size: number
    ): Promise<[SubmissionNodeStruct | null, Error | null]> {
        const iter = this.iterateWithOffsetAndBatch(offset, batch, true)
        const tree = new MerkleTree()

        for (let i = 0; i < size; ) {
            let [ok, err] = await iter.next()
            if (err != null) {
                return [null, err]
            }
            if (!ok) {
                break
            }

            const current = iter.current()
            const segRoot = AbstractFile.segmentRoot(current)
            tree.addLeafByHash(segRoot)
            i += current.length
        }

        tree.build()

        const numChunks = size / DEFAULT_CHUNK_SIZE
        const height = Math.log2(numChunks)

        const node: SubmissionNodeStruct = {
            height: height,
            root: tree.rootHash() as string,
        }

        return [node, null]
    }
}
