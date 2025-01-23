import pkg from 'ethers';
const { ethers } = pkg;
// Assuming common.Hash and common.Address are hex strings
type Hash = string
type Address = string

enum AccessControlType {
    GrantAdminRole = 0x00,
    RenounceAdminRole = 0x01,
    SetKeyToSpecial = 0x10,
    SetKeyToNormal = 0x11,
    GrantWriteRole = 0x20,
    RevokeWriteRole = 0x21,
    RenounceWriteRole = 0x22,
    GrantSpecialWriteRole = 0x30,
    RevokeSpecialWriteRole = 0x31,
    RenounceSpecialWriteRole = 0x32,
}

interface StreamRead {
    StreamId: Hash
    Key: Uint8Array
}

interface StreamWrite {
    StreamId: Hash
    Key: Uint8Array
    Data: Uint8Array
}

export interface AccessControl {
    Type: AccessControlType
    StreamId: Hash
    Account?: Address
    Key?: Uint8Array
}

export class StreamData {
    Version: number
    Reads: StreamRead[] = []
    Writes: StreamWrite[] = []
    Controls: AccessControl[] = []

    constructor(version: number) {
        this.Version = version
    }

    size(): number {
        let size = 8 // version size in bytes

        size += 4 // Reads size prefix
        for (const v of this.Reads) {
            size += 32 + 3 + v.Key.length
        }

        size += 4 // Writes size prefix
        for (const v of this.Writes) {
            size += 32 + 3 + v.Key.length + 8 + v.Data.length
        }

        size += 4 // Controls size prefix
        for (const v of this.Controls) {
            size += 1 + 32 // Type + StreamId
            if (v.Account) {
                size += 20 // Address length
            }
            if (v.Key) {
                size += 3 + v.Key.length
            }
        }

        return size
    }

    private encodeSize24(size: number): Uint8Array {
        if (size === 0) {
            throw new Error('errKeyIsEmpty')
        }
        const buf = new Uint8Array(4)
        const view = new DataView(buf.buffer)
        view.setUint32(0, size, false)
        if (buf[0] !== 0) {
            throw new Error('errKeyTooLarge')
        }
        return buf.slice(1)
    }

    private encodeSize32(size: number): Uint8Array {
        const buf = new Uint8Array(4)
        const view = new DataView(buf.buffer)
        view.setUint32(0, size, false)
        return buf
    }

    private encodeSize64(size: number): Uint8Array {
        const buf = new Uint8Array(8)
        const view = new DataView(buf.buffer)
        view.setBigUint64(0, BigInt(size), false)
        return buf
    }

    public encode(): Uint8Array {
        const encoded = new Uint8Array(this.size())
        let offset = 0

        // version
        encoded.set(this.encodeSize64(this.Version), offset)
        offset += 8

        // reads
        encoded.set(this.encodeSize32(this.Reads.length), offset)
        offset += 4
        for (const v of this.Reads) {
            encoded.set(ethers.getBytes(v.StreamId), offset)
            offset += 32

            const keySize = this.encodeSize24(v.Key.length)
            encoded.set(keySize, offset)
            offset += keySize.length

            encoded.set(v.Key, offset)
            offset += v.Key.length
        }

        // writes
        encoded.set(this.encodeSize32(this.Writes.length), offset)
        offset += 4
        for (const v of this.Writes) {
            // add stream id
            encoded.set(ethers.getBytes(v.StreamId), offset)
            offset += 32
            const keySize = this.encodeSize24(v.Key.length)

            // add key size
            encoded.set(keySize, offset)
            offset += keySize.length

            // add key
            encoded.set(v.Key, offset)
            offset += v.Key.length

            // add value size, add value later
            const dataSize = this.encodeSize64(v.Data.length)
            encoded.set(dataSize, offset)
            offset += dataSize.length
        }

        // add all values
        for (const v of this.Writes) {
            encoded.set(v.Data, offset)
            offset += v.Data.length
        }

        // controls
        encoded.set(this.encodeSize32(this.Controls.length), offset)
        offset += 4
        for (const v of this.Controls) {
            encoded[offset] = v.Type
            offset += 1
            encoded.set(ethers.getBytes(v.StreamId), offset)
            offset += 32

            if (v.Key !== undefined) {
                const keySize = this.encodeSize24(v.Key.length)
                encoded.set(keySize, offset)
                offset += keySize.length
                encoded.set(v.Key, offset)
                offset += v.Key.length
            }

            if (v.Account !== undefined) {
                encoded.set(ethers.getBytes(v.Account), offset)
                offset += 20
            }
        }

        return encoded
    }
}
