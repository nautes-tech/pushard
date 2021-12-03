# PUSHARD Progressively deploy commits between AWS Amplify environments

<br>

## Description

When creating a new project with AWS Amplify life is good: you have a lot of different AWS services handy and ready to be used in a integrated way. If you ever used Amplify you know what we are talking about.
Everything is fine until you begin to use [Amplify environments](https://docs.amplify.aws/cli/teams/overview/). This is because Amplify creates a copy of every service you are using for every environment you are creating. When it comes to Appsync there is no exception.

If you need different environment like `development`, `test` and `production` (maybe you even have `demo`!) you will find yourself with three times your cognito pools (if you have authentication), three times your lambdas and three times your graphql tables. Often times when you are developing, you will have to make changes to your `schema.graphql` but you don't want to reflect those changes in other environments right away because maybe the UI is still not updated or simply because your work isn't completly done yet and you don't want to deploy a broken version.
The problem you can incur into is a known Amplify problem, in fact AWS even has a section on their docs about it: [Deploying multiple secondary indices (GSI)](https://docs.amplify.aws/cli-legacy/graphql-transformer/key/#deploying-multiple-secondary-indices-gsi), and their github repository has a lot of issues about this.

```text
Attempting to mutate more than 1 global secondary index at the same time on the <table_name> table in the stack.
An error occurred during the push operation: Attempting to mutate more than 1 global secondary index at the same time on the <table_name> table in the  stack.
```

If you try to modify 2 or more connections on the same table, when you try to push your changes to Cloud Formation with the command `amplify push`, you will get this error. When you're working on the development branch is not a big deal because you only have to make multiple "amplify push" in order to gradually change the connections state.

The REAL problem comes after you have made a number of amplify push on your development environment and you want to replicate the final schema.graphql to the test or production environment. Suppose you made 10 amplify push on your development environment but your production environment has never been updated after push number 3: now if you try to move your current schema.graphql (let's call it version 10) over your schema.graphql version 3 on production, you will have a big problem. Amplify won't be able to make multiple updates on the secondary indexes of your production tables just like it wasn't before, when you was trying to make only two updates together on the same table.

**You would have to replicate the exact sequence of successful updates you made on you development environment to you production one.**

Here comes into play PUSHARD!

![git-action flwo](./images/flow.png 'git-action flow')

First of all **you have to** make a commit on git after **every** `amplify push` on your environment.
This Git Action will then take care to grab your commit hisory from development branch, detect the exact slice of commits you need to fully replicate the development verison of schema.graphql to your target environment. In order to deploy every update it will try to merge the current development commit into target branch, launch `amplify push` command and finally `git commit` the result after every successful operation on the target branch.
If something shoud go south during the process, it will push to git everything is committed at the time, the next time it will try to pick up the process where it left off.

Now, this flow is correct from a AWS standpoint because DynamoDB will be able to update step by step its tables. But at the same time, when asking many consecutive Cloud Formation updates, especially if you created or updated a lambda in your stack too, will take longer than the time of the simple `amplify push` command, so, at the next iteragion of updates loop, you could have another error:

```text
Resource is not in the state stackUpdateComplete
```

This means that Cloud Formation has not yet completely update your lambda resources and, because of this, it won't be able to make further updates.
Because of this you **have to** make a commit after every time you create or modify a lambda function. This way our Git Action will be able to successfully push the change to amplify and during the next loop iteration it will wait for Cloud Formation to be in the `UPDATE_COMPLETE` state before trying to update the stack again.

When the git action is starting it can send you a Telegram message writing how many commits it will take from development to the target branch; it will message you after every successful `amplify push` operation and if something goes wrong.

<br>
<br>

## Options

You will have the chance to choose set the following options every time you run PUSHARD

![PUSHARD options](./images/gitaction.png 'PUSHARD options')

- Source from: the branch you want to read commits from;
- Target deploy hash: the hash of the latest commit you want to move to your target branch;
- Deploys to skip: if you want to skip some commit during the loop you can write them here, comma separated;
- Destination branch: the name of the branch you are moving updates to

<br>
<br>

## Telegram

If you want to keep an eye on the progress of the git action you can create a Telegram bot and use your newly created bot token and a chat id (of a group for example) to receive realtime messages with current status or errors.

<br>
<br>

## Usage

```yml
name: pushard

on:
  workflow_dispatch:
    inputs:
      deployHash:
        description: 'Target deploy hash'
        required: true
      skipHashes:
        description: 'Deploys to skip'
        required: false
      dstBranch:
        description: 'Destination branch'
        required: true

jobs:
  run_pushard:
    name: Run PUSHARD
    runs-on: ubuntu-18.04
    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Setup Node.js environment
        uses: actions/setup-node@v2.1.5
        with:
          node-version: '14'

      - name: Create working dir
        shell: bash
        run: mkdir tempdir

      - name: Install @aws-amplify/cli node package
        run: npm install -g @aws-amplify/cli@7.3.2

      - name: PUSHARD
        run: |
          echo "Target deploy hash: ${{ github.event.inputs.deployHash }}"
          echo "Deploys to skip: ${{ github.event.inputs.skipHashes }}"
          echo "Destination branch: ${{ github.event.inputs.dstBranch }}"
          cd builder
          npm install
          npm start
        env:
          DEPLOY_HASH: ${{ github.event.inputs.deployHash }}
          SKIP_HASHES: ${{ github.event.inputs.skipHashes }}
          DST_BRANCH: ${{ github.event.inputs.dstBranch }}
          AMPLIFY_PROJECT_REPO: ${{ secrets.AMPLIFY_PROJECT_REPO }}
          AWS_ACCESS_KEY_ID: ${{ secrets.ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.SECRET_ACCESS_KEY }}
          AWS_PROFILE: ${{ secrets.AWS_PROFILE }}
          GH_USERNAME: ${{ secrets.GH_USERNAME }}
          GH_USER_PAT: ${{ secrets.GH_USER_PAT }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
```

<br>
<br>

## Setup

You will have the chance to set the following settings while configuring PUSHARD for the first time
You have to set the following [Encrypted action secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

- **AMPLIFY_PROJECT_REPO**: the repository of your Amplify project, the `amplify` folder has to be in the root folder
- **AWS_ACCESS_KEY_ID**: connect Amplify CLI with your created IAM user ([more here](https://docs.amplify.aws/cli/start/install/#option-2-follow-the-instructions))
- **AWS_SECRET_ACCESS_KEY**: see above
- **AWS_PROFILE**: the name of you AWS profile, see on [IAM users](https://console.aws.amazon.com/iamv2/home?#/users)
- **GH_USERNAME**: your GitHub username
- **GH_USER_PAT**: user [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) to access Github from the action. Create a PAT and copy it to the repo secrets
- **TELEGRAM_BOT_TOKEN**: telegram bot [authentication token](https://core.telegram.org/bots#creating-a-new-bot)
- **TELEGRAM_CHAT_ID**: Unique identifier for the target chat or username of the target channel (in the format @channelusername) ([more here](https://core.telegram.org/bots/api#sendmessage))

<br>
<br>

## Example

### Deploy hash 123456

![deploy hash 123456](./images/deploy-1.png 'deploy hash 123456')

| deploy steps | action                                           |
| ------------ | ------------------------------------------------ |
| step 1       | merge commit hash 123456 from dev to prod branch |
| step 2       | amplify init to check new lambda functions       |
| step 3       | amplify push                                     |
| step 4       | git commit                                       |
| step 5       | git push                                         |

### Deploy hash 123456 and 456789

![deploy hash 123456 and 456789](./images/deploy-2.png 'deploy hash 123456 and 456789')

| deploy steps | action                                           |
| ------------ | ------------------------------------------------ |
| step 1       | merge commit hash 123456 from dev to prod branch |
| step 2       | amplify init to check new lambda functions       |
| step 3       | amplify push                                     |
| step 4       | git commit                                       |
| step 5       | git push                                         |
|              |                                                  |
| step 6       | merge commit hash 234567 from dev to prod branch |
| step 7       | amplify init to check new lambda functions       |
| step 8       | amplify push                                     |
| step 9       | git commit                                       |
| step 10      | merge commit hash 345678 from dev to prod branch |
| step 11      | amplify init to check new lambda functions       |
| step 12      | amplify push                                     |
| step 13      | git commit                                       |
| step 14      | merge commit hash 456789 from dev to prod branch |
| step 15      | amplify init to check new lambda functions       |
| step 16      | amplify push                                     |
| step 17      | git commit                                       |
| step 18      | git push                                         |

<br>
<br>

## Who

Alessandro Annini <alessandro.annini@gmail.com> @[Nautes](https://github.com/orgs/nautes-tech)
<br>
Simone Agostinelli <simone-ag@hotmail.it> @[Nautes](https://github.com/orgs/nautes-tech)

<br>
<br>

## Disclamer

You use this service at you own risk. We take no responsibility for any damage caused by this service.
