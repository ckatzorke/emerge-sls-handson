'use strict';
const asciify = require('asciify-image');
const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");


module.exports.thumbnail = async function (context, blob) {
  let options = {
    fit: 'box',
    width: 60,
    height: 60
  };
  let ascii = await asciify(blob, options);
  context.log(ascii);
  
  // Enter your storage account name and shared key
  const account = process.env.ACCOUNT_NAME;
  const accountKey = process.env.ACCOUNT_KEY;

  // Use StorageSharedKeyCredential with storage account and account key
  // StorageSharedKeyCredential is only avaiable in Node.js runtime, not in browsers
  const sharedKeyCredential = new StorageSharedKeyCredential(account, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    sharedKeyCredential
  );


  const containerName = 'emerge';


  const containerClient = blobServiceClient.getContainerClient(containerName);

  const blobName = "asciify-" + new Date().getTime();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const uploadBlobResponse = await blockBlobClient.upload(ascii, ascii.length);
  context.log(`Upload block blob ${blobName} successfully`, uploadBlobResponse.requestId);

  context.done();
};
