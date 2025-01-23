import pkg from 'ethers';
const { ethers } = pkg;
import { MAX_KEY_SIZE, MAX_SET_SIZE, STREAM_DOMAIN } from './constants.js';
import { StreamData } from './types.js';
export class StreamDataBuilder {
    version;
    streamIds;
    controls;
    reads;
    writes;
    constructor(version) {
        this.version = version;
        this.streamIds = new Map();
        this.controls = [];
        this.reads = new Map();
        this.writes = new Map();
    }
    hexToBytes(hex) {
        // Remove '0x' prefix if it exists
        if (hex.startsWith('0x')) {
            hex = hex.slice(2);
        }
        return Buffer.from(hex, 'hex');
    }
    build(sorted = false) {
        const data = new StreamData(this.version);
        // controls
        data.Controls = this.buildAccessControl();
        // reads
        data.Reads = [];
        for (const [streamId, keys] of this.reads.entries()) {
            for (const k of keys.keys()) {
                const key = this.hexToBytes(k);
                if (key.length > MAX_KEY_SIZE) {
                    throw new Error('errKeyTooLarge');
                }
                if (key.length === 0) {
                    throw new Error('errKeyIsEmpty');
                }
                data.Reads.push({
                    StreamId: streamId,
                    Key: key,
                });
                if (data.Reads.length > MAX_SET_SIZE) {
                    throw new Error('errSizeTooLarge');
                }
            }
        }
        // writes
        data.Writes = [];
        for (const [streamId, keys] of this.writes.entries()) {
            for (const [k, d] of keys.entries()) {
                const key = this.hexToBytes(k);
                if (key.length > MAX_KEY_SIZE) {
                    throw new Error('errKeyTooLarge');
                }
                if (key.length === 0) {
                    throw new Error('errKeyIsEmpty');
                }
                data.Writes.push({
                    StreamId: streamId,
                    Key: key,
                    Data: Uint8Array.from(d),
                });
                if (data.Writes.length > MAX_SET_SIZE) {
                    throw new Error('errSizeTooLarge');
                }
            }
        }
        if (sorted) {
            data.Reads.sort((a, b) => {
                const streamIdI = a.StreamId;
                const streamIdJ = b.StreamId;
                if (streamIdI === streamIdJ) {
                    return ethers.hexlify(a.Key) < ethers.hexlify(b.Key)
                        ? -1
                        : 1;
                }
                else {
                    return streamIdI < streamIdJ ? -1 : 1;
                }
            });
            data.Writes.sort((a, b) => {
                const streamIdI = a.StreamId;
                const streamIdJ = b.StreamId;
                if (streamIdI === streamIdJ) {
                    return ethers.hexlify(a.Key) < ethers.hexlify(b.Key)
                        ? -1
                        : 1;
                }
                else {
                    return streamIdI < streamIdJ ? -1 : 1;
                }
            });
        }
        return data;
    }
    set(streamId, key, data) {
        this.addStreamId(streamId);
        if (!this.writes.has(streamId)) {
            this.writes.set(streamId, new Map());
        }
        let maps = this.writes.get(streamId);
        maps.set(Buffer.from(key).toString('hex'), data);
        this.writes.set(streamId, maps);
    }
    addStreamId(streamId) {
        this.streamIds.set(streamId, true);
    }
    buildTags(sorted = false) {
        let ids = Array.from(this.streamIds.keys());
        if (sorted) {
            ids.sort((a, b) => (a < b ? -1 : 1));
        }
        return this.createTags(ids);
    }
    createTags(streamIds) {
        let result = new Uint8Array((1 + streamIds.length) * 32); // Assuming Hash is 32 bytes
        result.set(STREAM_DOMAIN, 0);
        streamIds.forEach((id, index) => {
            result.set(ethers.getBytes(id), 32 * (index + 1));
        });
        return result;
    }
    buildAccessControl() {
        if (this.controls.length > MAX_SET_SIZE) {
            throw new Error('errSizeTooLarge');
        }
        return this.controls;
    }
}
//# sourceMappingURL=builder.js.map
