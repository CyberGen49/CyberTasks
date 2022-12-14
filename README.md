
# CyberTasks
An easy to use to-do list and task scheduler webapp.

![CyberTasks promotional image](/web/assets/promo.png)

**Note:** Large portions of the front-end app's styling and scripting is hosted separately. Those resources can be found in the [CyberGen49/web-resources](https://github.com/CyberGen49/web-resources) repository.

## Running the server yourself
While the intention isn't for others to be hosting copies of CyberTasks, hosting a local server may be useful for development.

1. Install Node.js
    * Everything is tested and working on Node v17.9.0
1. Clone the repository to a directory on your computer
1. Open your terminal and `cd` into the new directory
1. Run `npm install` to install the required dependencies
1. [Create a Discord application](https://discord.com/developers/applications) to use for sign-in
    * In the **OAuth2** tab, add a redirect URL for your domain, followed by `/discord-callback`, like `https://tasks.example.com/discord-callback`
1. Create a file in the project folder named `credentials.json`, and paste the following contents within:  
    ```json
    {
        "client_id": "...",
        "client_secret": "...",
        "redirect_url": "...",
        "allow_new_users": false
    }
    ```
1. Update each field of the file by replacing `...`:
    * `client_id` is your application's client ID
    * `client_secret` is your application's client secret
    * `redirect_url` is the same URL that you added to your application
    * `allow_new_users` defines whether unapproved users are allowed to sign in or not
1. If `allow_new_users` is set to `false`, create another file named `allowedUsers.json` and list the Discord user IDs of the users you want to grant access to, like so:
    ```json
    [
        "id1", "id2", "id3", "..."
    ]
    ```
    * To copy user IDs, enable developer mode in Settings > Advanced, then right-click on a user and click "Copy ID"
    * **User IDs must be enclosed in quotes to work properly**
1. [Download and install SQLite](https://www.sqlite.org/download.html)
1. In your terminal (still in the project directory), create and structure the database with this command:
    ```
    sqlite3 main.db ".read database-schema.sql"
    ```
1. Start the server with `npm start`
    1. Alternatively, run `node wrapper.js` to make sure the server restarts if it crashes. The wrapper is also capable of sending logs to a Discord channel using a bot. To enable this functionality, create a bot account on your Discord application, copy its token, and set it to `bot_token` in `credentials.json`, then set `log_channel` to the ID of the text channel that you want logs to be sent in. Make sure the bot has the **Message content intent** enabled, and join it to your server by selecting **bot** under **OAuth2 > URL Generator**.

The server is hosted on a nonstandard port, as it's meant to be proxied through a virtual host on a parent webserver like Apache or using a service like [Cloudflare Tunnel](https://www.cloudflare.com/products/tunnel/).