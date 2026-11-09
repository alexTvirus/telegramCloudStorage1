# Telegram Cloud Storage

### Environment variables required

Create a file `.env` on the root folder with the following credentials.

/server/database/database.ts

"mongodb://@localhost:27017/it_kb?authSource=admin";


`mongoPassword = ******`

`mongoUser = ******`

`jwtSecret = ******`

### Installation

- `npm install`

### Start Servers

For development we have 2 servers for Node and React.


nvm install 16


nvm use 16

npm rebuild bcrypt --update-binary



- `npm run react:dev`
- `npm run node:dev`

Now the UI will be available at http://localhost:3001

![server](./ui/public/ss/ss-home.png)

## Register new user

[Read here](https://github.com/ebinxavier/telegramCloudStorage/blob/main/ui/public/help/help.md)
