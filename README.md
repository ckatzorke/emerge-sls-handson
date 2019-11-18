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
	“name”: “emerge2019”
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


