import {Client, DMChannel, Message, TextChannel, User} from "discord.js";
import {mkdirSync, readFileSync, rmSync, writeFileSync} from "fs";
import {join} from "path";
import {strict} from "assert";
import {arch} from "os";
import fetch from "node-fetch";
import {randomBytes} from "crypto";
import * as urlRegex from "url-regex";
import {extension} from "mime-types";
import * as AdmZip from "adm-zip";

let cfg = JSON.parse(readFileSync("config.json", "utf-8"));
let cl = new Client();

async function archiveChannel(channel: TextChannel, message?: Message): Promise<ArchiveFile> {
    let msg = channel.messages;
    let opts = {"limit": 50}
    let i = 0;
    console.log("Processing " + channel.id)
    let file = await newArchive(join(__dirname, `archive-${channel.id}-${new Date().getTime()}`));
    while (true) {
        let msgs = await msg.fetch(opts);
        for (const msg of msgs.array()) {
            await processMessage(msg, file);
        }
        opts["before"] = msgs.last().id;
        i += msgs.size;
        console.log(`Progress: ${i}/?`)
        if (message)
            await message.reply(`Progress: ${i}/?`)
        if (msgs.size < 50) {
            break;
        }
    }
    console.log(`Total processed: ${i}! Done.`)
    if (message)
        await message.reply(`Total processed: ${i}! Done.`)
    await saveFile(file);
    return file;
}

let AUTHORIZED = cfg.authorized
cl.on("message", (msg) => {
    if(msg.author.bot)
        return;
    if (msg.channel instanceof DMChannel) {
        if (AUTHORIZED.includes(msg.author.id)) {
            command(msg.content, msg);
        } else {
            msg.reply("You are not authorized to use this bot.");
        }
    } else {
        if (msg.content.startsWith("a>")) {
            if(AUTHORIZED.includes(msg.author.id)) {

                command(msg.content.substr(2), msg)
            } else
                msg.reply("You are not authorized to use this bot.");
        }
    }
})

async function command(content, msg: Message) {
    let args = content.split(" ");
    let command = args[0];
    args = args.slice(1);

    switch (command) {
        case "archive": {
            let mentions = msg.mentions;
            for (const channel of mentions.channels.array()) {
                await msg.reply("Now processing... " + channel.id)
                let archive = await archiveChannel(channel, msg);
                console.log("Zipping...")
                let newZip = new AdmZip();
                newZip.addLocalFolder(archive.path);
                let zipFile = join(__dirname, `output-${Date.now()}.zip`);
                newZip.writeZip(zipFile);
                await msg.reply(`Channel ${channel.id} done: `, {
                    files: [zipFile]
                })
                console.log("Done!")
                rmSync(zipFile);
            }
        }
        default: {
            await msg.reply("Command not recognized.")
        }
    }
}

cl.login(cfg.token);

async function newArchive(path: string): Promise<ArchiveFile> {
    mkdirSync(path, {recursive: true});
    mkdirSync(join(path, "attachments"), {recursive: true});

    return {messages: {}, attachments: {}, users: {}, path: path};
}

function randomName(): string {
    return randomBytes(24).toString("hex");
}

async function processUser(user: User, archive: ArchiveFile) {
    if (!archive.users[user.id]) {
        let url = user.displayAvatarURL({
            format: "webp",
            size: 4096
        });
        let pfp = await fetch(url);
        let name = randomName();
        let buf = await pfp.buffer();
        let path = join("attachments", name + ".webp");
        writeFileSync(join(archive.path, path), buf);

        let aUser: ArchiveUser = {
            discriminator: user.discriminator,
            id: user.id,
            profilePicture: name,
            username: user.username
        }
        let aAttachment: ArchiveAttachment = {
            id: name,
            newPath: path,
            originalName: "",
            originalUrl: url,
            type: ArchiveAttachmentType.AVATAR,
            mime: "image/webp"
        }

        archive.users[user.id] = aUser;
        archive.attachments[name] = aAttachment;
    }
}

function addExtension(name: string, mime?: string) {
    if (!mime)
        return name;
    let ext = extension(mime);
    if (!ext)
        return name;
    return name + "." + extension(mime);
}

async function processMessage(msg: Message, archive: ArchiveFile) {
    let attachments = msg.attachments;
    let ids = [];
    await processUser(msg.author, archive);
    for (const mention of msg.mentions.members.array()) {
        await processUser(mention.user, archive);
    }
    for (const attachment of attachments.array()) {
        ids.push(attachment.id);
        let name = randomName();
        let data = await fetch(attachment.proxyURL);
        let buf = await data.buffer();
        let mime = data.headers.get("Content-Type");
        writeFileSync(join(archive.path, "attachments", addExtension(name, mime)), buf);
        let aAttachment: ArchiveAttachment = {
            newPath: join("attachments", addExtension(name, mime)),
            originalName: attachment.name,
            originalUrl: attachment.proxyURL,
            id: attachment.id,
            type: ArchiveAttachmentType.FILE,
            mime
        }
        archive.attachments[attachment.id] = aAttachment;
    }
    let urls = msg.content.match(urlRegex());
    if (urls != null)
        for (const url of urls) {

            let type = "unknown"
            let name = randomName();
            let downloaded = false;
            try {
                let data = await fetch(url);
                let buf = await data.buffer();
                type = data.headers.get("Content-Type");
                writeFileSync(join(archive.path, "attachments", addExtension(name, type)), buf);
                downloaded = true;
            } catch (e) {
            }

            let parts = new URL(url).pathname.split("/");
            let aAttachment: ArchiveAttachment = {
                newPath: downloaded ? join("attachments", addExtension(name, type)) : null,
                originalName: parts[parts.length - 1],
                originalUrl: url,
                id: name,
                type: ArchiveAttachmentType.URL,
                mime: type
            }
            archive.attachments[name] = aAttachment;
            ids.push(name);
            try {

            } catch (e) {
            }
        }

    let amsg: ArchiveMessage = {
        attachments: ids,
        content: msg.cleanContent,
        edited: msg.editedTimestamp,
        originalContent: msg.content,
        sent: msg.createdTimestamp,
        sender: msg.author.id
    }
    archive.messages[msg.id] = amsg;

}

async function saveFile(archive: ArchiveFile) {
    writeFileSync(join(archive.path, "info.json"), JSON.stringify(archive, null, 4));
}

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
