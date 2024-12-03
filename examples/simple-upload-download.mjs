import { ZgFile, Indexer, getFlowContract } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import 'dotenv/config';

const privateKey = PRIVATE_KEY;

// Choose between Turbo and Standard storage:
// Uncomment for **Turbo** storage
// const flowAddr = "0xbD2C3F0E65eDF5582141C35969d66e34629cC768";
// const indRpc = 'https://indexer-storage-testnet-turbo.0g.ai';

// Use this for **Standard** storage
const flowAddr = "0x0460aA47b41a66694c0a73f667a1b795A5ED3556"; 
const indRpc = 'https://indexer-storage-testnet-standard.0g.ai';

const evmRpc = 'https://evmrpc-testnet.0g.ai';
const provider = new ethers.JsonRpcProvider(evmRpc);
const signer = new ethers.Wallet(privateKey, provider);
const flowContract = getFlowContract(flowAddr, signer);

// Initialize the Indexer with the storage endpoint (Standard or Turbo)
const indexer = new Indexer(indRpc);
const file = await ZgFile.fromFilePath('hello.txt');
const outputFile = 'output.txt';

// Create a file object and get its Merkle Tree (used to verify the file's integrity)
async function createFileObjectAndGetMerkleTree(filePath) {
    const file = await ZgFile.fromFilePath(filePath);
    const [tree, err] = await file.merkleTree();
    if (err === null) {
        console.log("File Root Hash: ", tree.rootHash());
    } else {
        console.error("Error getting Merkle tree: ", err);
    }
    await file.close();
}

// Call this function to create the file object and retrieve its Merkle Tree
createFileObjectAndGetMerkleTree('hello.txt');

// Upload the file to 0g storage
async function uploadFile(file) {
  const [tx, err] = await indexer.upload(file, 0, evmRpc, flowContract);
  if (err != undefined) {
    console.log("Error uploading file: ", err);
  } else {
    console.log("File uploaded successfully", tx);
  }
}

// Call this function to upload the file
// uploadFile(file);

// Download a file from 0g storage using its hash
async function downloadFile(outputFile) {
  const err = await indexer.download('<FILE_MERKLE_ROOT_HASH>', outputFile, false);
  if (err != undefined) {
   console.log("Error downloading file: ", err);
  } else {
    console.log("File downloaded successfully"); 
  }
}

// Uncomment this line to download the file
// downloadFile(outputFile);
