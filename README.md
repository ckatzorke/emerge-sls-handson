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

Change directory and install all dependencies.  
**Note** If you are using node version manager, please make sure that you are using node 10.x! E.g. running `nvm use 10`.  You can create a `.nvmrc` file containing the version number (like `10.17.0`).

```bash
cd emerge-sls-handson && npm install
```

## Serverless.yml

Modify `serverless.yml`, change the region according your local region (like West Europe for me) and change the prefix to make sure generated resources are more unique.  
Serverless wil use the prefix for autogenerating the resources that are automatically created, like resource group, storage account etc. For storage accounts for example, the name must be **globally** unique, since an URL is generated (https://<storageaccountname>.blob.core.windows.net).

```yaml
service: emerge-sls-handson

provider:
  name: azure
  region: West Europe
  runtime: nodejs10.x
  prefix: emerge
```

Let's take a look at the defined handlers.

## Handlers

Two handlers are auto generated, `hello` and `goodbye`. You can find the source code in `src/handlers/hello.js` and `src/handlers/goodbye.js` respectively.  
Add POST binding to the http events, so we can post our payload (beside using GET):

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

Serverless provides you the possibility to test and invoke your functions locally (without deploying them first). You can achieve the same with Azure tooling, serverless provides you a godd abstraction about provider specific information.  

Start a local function handler with

```bash
sls offline
```
and see the magic happen. After some time, it will prompt the local endpoints, and signals its readiness.

You can use CURL to test the function (using either GET or POST)

```bash
curl http://localhost:7071/api/hello?name=hello
curl -X POST -d '{ "name": "emerge" }' http://localhost:7071/api/goodbye
```

Aletrantively, you can use the `sls` tool

```bash
sls invoke local -f hello -d '{ "name": "Christian" }'
```

*(Note that it is invoked using query parameters, even if we are using a json payload, neat)*

### Using POST data

Create a file `testdata/data.json`

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

Now we want to deploy to azure.  
There are some steps necessary

First, we need a service-principal, a user that does the job.

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
**Note that the password cannot be retrieved later!** If you cant remember the credentials, you need to reset your principal with `az ad sp credential reset --name http://emerge-2019-serverless`.

Export some values as environment variables, these will be needed by the serverless framework to do the deployments.  
You can already imagine how this would integrate nicely into a CI/CD system...

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
az storage account create --name $storage --location westeurope --resource-group $rg --sku Standard_LRS --kind StorageV2

# Create a container. A container is a bucket for blobs
az storage container create --account-name $storage --name emerge
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

module.exports.printMessage = async function(context, blob) {
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
az storage account show-connection-string --resource-group $rg --name $storage --query connectionString --output tsv
```

This should yield something like `DefaultEndpointsProtocol=https;EndpointSuffix=core.windows.net;AccountName=slsemergestorage;AccountKey=ZG9uJ3QteW91LWRhcmUtdG8tZGVjb2RlLXRoaXMtOy0p`

local.settings.json  

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "DefaultEndpointsProtocol=https;EndpointSuffix=core.windows.net;AccountName=slsemergestorage;AccountKey=ZG9uJ3QteW91LWRhcmUtdG8tZGVjb2RlLXRoaXMtOy0p",
    "FUNCTIONS_WORKER_RUNTIME": "node"
  }
}
```

Run it locally using `sls offline`.

### Add some images

```bash
export AZURE_STORAGE_ACCOUNT=emerge
export AZURE_STORAGE_KEY=ZG9uJ3QteW91LWRhcmUtdG8tZGVjb2RlLXRoaXMtOy0p
az storage blob copy start --destination-container emerge --account-name=$storage --account-key=$AZURE_STORAGE_KEY --destination-blob=cat.jpg --source-uri https://cataas.com/cat
```

### Thumbnail

https://www.npmjs.com/package/image-thumbnail

### Asciify

```bash
npm install asciify-image --save
```

```yaml
Serverless.yml
  storageBlob:
    handler: src/handlers/storageBlob.asciify
    events:
      - blob:
        x-azure-settings:
          name: blob # Specifies which name is available on `context`
          path: emerge/{blobName}
          connection: AzureWebJobsStorage # App Setting/environment variable which contains Storage Account Connection String
```

Source
