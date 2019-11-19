# Hands On Serverless Functions Development with the Serverless Framework on Microsoft Azure

## Prerequisites

- [Node.js](https://nodejs.org/en/)
- [Serverless Framework](https://serverless.com/)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest)

## Getting Started

Scaffold a new serverless project, using the `serverless`or `sls` command:

```bash
sls create -t azure-nodejs -p emerge-sls-handson
```

Change directory and install all dependencies

```bash
cd emerge-sls-handson && npm install
```

## Serverless.yml

Modify `serverless.yml`, change the region accoring your local region (like Wst Europe) and change the prefix to make sure generated resources are more unique.
Look at ethe defined handlers.

## Handlers

Two handlers are auto generated, hello and goodbye.
Let's add POST binding to the http event:

```yml
functions:
  hello:
    handler: src/handlers/hello.sayHello
    events:
      - http: true
        x-azure-settings:
          methods:
            - GET
            - POST
          authLevel: anonymous # can also be `function` or `admin`

  goodbye:
    handler: src/handlers/goodbye.sayGoodbye
    events:
      - http: true
        x-azure-settings:
          methods:
            - GET
            - POST
          authLevel: anonymous
```

## Invoke locally

You can start a local function handler with

```bash
sls offline
```

You can use CURL to test the function

```bash
curl http://localhost:7071/api/hello?name=hello
curl -X POST -d '{ "name": "emerge" }' http://localhost:7071/api/goodbye
```

Aletrantively you can use the `sls` tool

```bash
sls invoke local -f hello -d '{ "name": "Christian" }'
```

Note that it is invoked using query parameters, even if we are using a json payload, neat)

### Using POST data

Create testdata/data.json

```json
{
	"name": "emerge2019"
}
```

And invoke using POST method

```bash
sls invoke local -f hello -p testdata/data.json -m POST
```

## Deploy

Now we want to deploy to azure. First we need a service-principal

Login to azure cli

```bash
# Login to Azure
az login
# Set Azure Subscription for which to create Service Principal
# get id from portal.azure.com
az account set -s f2d8e35b-7bea-44ac-adb3-1f5046995578

# Create SP with unique name
az ad sp create-for-rbac --name emerge-2019-serverless
```

This will yield something like

```json
{
  "appId": "20b16e47-f449-4ce5-95dd-e35216a0941d",
  "displayName": "emerge-2019-serverless",
  "name": "http://emerge-2019-serverless",
  "password": "xxxxx-xxxx-xxxx-xxxx-xxxxxxxx",
  "tenant": "8a1a8f97-85cc-41c2-851e-ef32aed34110"
}
```

Export some values as environment variables

```bash
export AZURE_SUBSCRIPTION_ID='f2d8e35b-7bea-44ac-adb3-1f5046995578'
export AZURE_TENANT_ID='8a1a8f97-85cc-41c2-851e-ef32aed34110'
export AZURE_CLIENT_ID='20b16e47-f449-4ce5-95dd-e35216a0941d'
export AZURE_CLIENT_SECRET='xxxxx-xxxx-xxxx-xxxx-xxxxxxxx'
```

Finally, deploy with

```bash
sls deploy
```

Watch the magic, at the end it yields the api published endpoints, curl it (using GET)

```bash
curl http://emerge-weur-dev-emerge-sls-handson.azurewebsites.net/api/goodbye\?name\=test
```

Now let’s use the sls cli to invoke it

```bash
sls invoke -f hello -p testdata/data.json -m POST
```

Vistit the Azure porta to look at generated resources.

## Add webpack

Add webpack and serverless-webpack plugin to the project

```bash
npm i serverless-webpack webpack webpack-cli --save-dev
```

Add plugin to serverless yaml

```yml
plugins: # look for additional plugins in the community plugins repo: https://github.com/serverless/plugins
  - serverless-azure-functions
  - serverless-webpack
```

Create `webpack.config.js` (in root directory)

```js
const path = require("path");
const slsw = require("serverless-webpack");

module.exports = {
  entry: slsw.lib.entries,
  target: "node",
  output: {
    libraryTarget: "commonjs2",
    library: "index",
    path: path.resolve(__dirname, ".webpack"),
    filename: "[name].js"
  },
  plugins: [],
};
```

Run `sls package` and compare zips:  
Before: ~ 64 kB  
After: 2.3kB

## Add a different binding - Blob Storage Trigger

We want to change the event trigger from a simple http event to a trigger executed whenever an item is uploaded to blob storage.  
*Note* You can use Blob Storage event trigger or event grid event trigger. Event Grid has several advantages, for more information about Event Grid look [here](https://azure.microsoft.com/en-us/services/event-grid/).  
However, for simplicity wie will us a blob trigger - you will need a general purpose storage account for this, which we will create first.

### Create Storage Account and Container

Create all necessary resources:

```bash
# First, create a resource group
export rg=rg-sls-emerge
az group create -l westeurope -n $rg

# Create a general purpose Storage Account - this is needed for the blob trigger event
# make sure to use a somehow unique name, sinde a global URL is generated for the storage
export storage=slsemergestorage
az storage account create --name $storage --location westeurope \ 
--resource-group $rg --sku Standard_LRS --kind StorageV2

# Create a container. A container is a bucket for blobs
export container=emerge
az storage container create --account-name $storage --name $container
```

### Register the extension

Since the blobTrigger is not enabled by default (only http and timer is), we need to enable the extensions.  
Edit the `host.json` (in your root folder) to match

```json
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[1.*, 2.0.0)"
  }
}
```

### Register the handler

Now we need to add the handler to `serverless.yml`, after the `goodbye`handler:

```yml
  blobStorage:
    handler: src/handlers/storageBlob.printMessage
    events:
      - blob:
        x-azure-settings:
          name: blob # Specifies which name is available on `context`
          path: emerge/{blobName}
          connection: AzureWebJobsStorage # App Setting/environment variable which contains Storage Account Connection String
```

### Create the handler

Create the file `src/handlers/storageBlob.js`  

```js
'use strict';

module.exports.printMessage = async function(context, blob, blobName) {
  context.log(`Blob received!`);
  context.done();
};
 ```

### Local invocation

We need to configure the function to connect to the storageaccount/container to get events on new blobs uploaded.
In the serverless.yml file, you cann see the `x-azure-settings` section, and the property `connection` - this will link to the appsetting containing the connection string to the container.  
We will need to set this locally, and add it to `local.settings.json`.  
Note that the file will be bootstrapped when running `sls create...` and is in the `.gitignore` list.

```bash
az storage account show-connection-string --resource-group $rg \
--name $storage --query connectionString --output tsv
```

This should yield something like `DefaultEndpointsProtocol=https;EndpointSuffix=core.windows.net;AccountName=slsemergestorage;AccountKey=kjakwjnmqwmwllllldkU1yp2mKrC4U4BcQnW6GQN+wwwwssdwwq==`

Local.settings.json  

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "DefaultEndpointsProtocol=https;EndpointSuffix=core.windows.net;AccountName=slsemergestorage;AccountKey=kclasjdhkjabskbwqjbkjewqhejRdKW2gaLLFqxFVpBaOOsdROl0gw9cw==",
    "FUNCTIONS_WORKER_RUNTIME": "node"
  }
}
```

Now add some images
export AZURE_STORAGE_ACCOUNT=$storage
export AZURE_STORAGE_KEY=kclwrPkUEeKRra9MshbFwipudmJXy3tN9u1yp2mKrC4U4BcQnW6GQN+ajegrtsfwcw==
az storage blob copy start --destination-container emerge --destination-blob=cat.jpg --source-uri https://cataas.com/cat



Asciify

npm install asciify-image --save

Serverless.yml
  storageBlob:
    handler: src/handlers/storageBlob.asciify
    events:
      - blob:
        x-azure-settings:
          name: blob # Specifies which name is available on `context`
          path: emerge/{blobName}
          connection: AzureWebJobsStorage # App Setting/environment variable which contains Storage Account Connection String


Source


