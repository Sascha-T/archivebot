## ArchiveBot 

### Config (./config.json)
````json
{
  "token": "YOUR DISCORD BOT TOKEN",
  "authorized": ["YOUR MAIN USER ACCOUNT ID"]
}
````
### Output format

````ts
interface ArchiveFile {
    messages: { [id: string]: ArchiveMessage },
    attachments: { [id: string]: ArchiveAttachment },
    users: { [id: string]: ArchiveUser },
    path: string
}

interface ArchiveUser {
    id: string,
    username: string,
    discriminator: string,
    profilePicture: string // attachment
}

interface ArchiveAttachment {
    id: string,
    originalName: string,
    originalUrl: string,
    newPath: string,

    mime: string,
    type: ArchiveAttachmentType
}

enum ArchiveAttachmentType {
    URL, // URL
    FILE, // Attachment
    AVATAR
}

interface ArchiveMessage {
    content: string, // todo: save links aswell
    sender: string,

    originalContent: string,
    attachments: string[],

    sent: number,
    edited: number,
}

````

### How to use?
Simply run ``a>archive`` and mention a channel ``#general`` after it. \
Alternatively send ``archive`` to the bot in DMs with a channel mentioned after it. (``<#1234567890>``)
