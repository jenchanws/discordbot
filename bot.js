import nodemailer from 'nodemailer'
import CLASS_TO_ROLE from "./class_to_role.js"
import dotenv from 'dotenv'
dotenv.config()
var GUILD
var VERIFIED_ROLE
var ADMIN_ROLE
const MESSAGE_IDS = []

import Discord from 'discord.js'
const verifications = new Map()
const client = new Discord.Client()
const cooldowns = new Discord.Collection()

console.log('loading commands\n')
client.dmCmds = new Discord.Collection()
import dm_commands from './dm_commands/commands.js'
dm_commands.forEach(cmd => {
    client.dmCmds.set(cmd.name, cmd)
    console.log('\x1b[36m%s\x1b[0m', `${cmd.name}.js loaded`)
})
console.log('dm_commands loaded\n')
client.regCmds = new Discord.Collection()
import reg_commands from './reg_commands/commands.js'
reg_commands.forEach(cmd => {
    client.regCmds.set(cmd.name, cmd)
    console.log('\x1b[36m%s\x1b[0m', `${cmd.name}.js loaded`)
})
console.log('reg_commands loaded\n')

class BotCommands {
    constructor () {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            }
        })
        this.PREFIX = process.env.PREFIX
        this.EMAIL_USER = process.env.EMAIL_USER
    }

    dmCommand(message, commandName, args) {
        if (!this.isMember(message.author.id)) return message.channel.send('> Please join the EECS Discord server before using any commands')
        if (!client.dmCmds.has(commandName)) return
        console.log('\x1b[36m%s\x1b[0m', `${message.author.tag} (${message.channel.type}): ${this.PREFIX + commandName} ${args.join(' ')}`)
        const command = client.dmCmds.get(commandName)
        if (this.verifyCommandArgs(message, command, args)) return
        if (this.updateCooldowns(message, command)) return
        try {
            command.execute(message, args, this)
        } catch (error) {
            console.error(error)
            return message.channel.send(`> Error executing command \`${commandName}\``)
        }
    }

    regCommand(message, commandName, args) {
        if (!client.regCmds.has(commandName)) return
        console.log('\x1b[36m%s\x1b[0m', `${message.author.tag} (${message.channel.type}): ${this.PREFIX + commandName} ${args.join(' ')}`)
        const command = client.regCmds.get(commandName)
        if (this.verifyCommandArgs(message, command, args)) return
        if (this.updateCooldowns(message, command)) return
        try {
            command.execute(message, args, this)
        } catch (error) {
            console.error(error)
            return message.channel.send(`> Error executing command \`${commandName}\``)
        }
    }

    verifyCommandArgs(message, command, args) {
        if (!command.flexArgs && command.args) {
            if (args.length != command.numArgs) {
                let reply = '> Improper arguments provided!'
                if (command.usage) {
                    reply += `\n> Proper usage is \`${this.PREFIX}${command.name} ${command.usage}\``
                }
                return message.channel.send(reply)
            }
        }
        return null
    }

    updateCooldowns(message, command) {
        if (!cooldowns.has(command.name)) cooldowns.set(command.name, new Discord.Collection())
        const now = Date.now()
        const timestamps = cooldowns.get(command.name)
        const cooldownTime = (command.cooldown || 1) * 1000
        if (timestamps.has(message.author.id)) {
            const expirationTime = timestamps.get(message.author.id) + cooldownTime
            if (now < expirationTime) {
                const secondsLeft = (expirationTime - now) / 1000
                return message.author.send(`> Please wait ${secondsLeft.toFixed(1)} seconds before reusing \`${command.name}\``)
            }
        }
        timestamps.set(message.author.id, now)
        setTimeout(() => {
            timestamps.delete(message.author.id)
            console.log('\x1b[32m%s\x1b[0m', `${message.author.tag} >${command.name} cd refreshed`)
        }, cooldownTime)
        return null
    }

    isMember(userID) {
        return GUILD.members.cache.has(userID)
    }

    isVerified(userID) {
        return GUILD.members.resolve(userID).roles.cache.has(VERIFIED_ROLE.id)
    }

    isMod(userID) {
        return GUILD.members.resolve(userID).roles.cache.has(ADMIN_ROLE.id)
    }

    generateCode() {
        const code = new Date().getTime() % 1000000
        return code < 1000000 ? code + 1000000 : code
    }

    queueCode(message, code) {
        const userTag = message.author.tag
        verifications.set(userTag, code)
        console.log(`User ${message.author.tag} successfully queued`)
        setTimeout(() => {
            code = verifications.get(userTag)
            if (code) console.log(`User ${message.author.tag} deleted from queue`)
            verifications.delete(userTag)
        }, 300000)
    }

    async verifyCode(message, code) {
        const userTag = message.author.tag
        if (!verifications.has(userTag)) {
            message.channel.send(`> User ${userTag} not found`)
            return false
        }
        if (verifications.get(userTag) != code) {
            message.channel.send('> Incorrect verification code')
            return false
        }
        verifications.delete(userTag)
        const member = GUILD.members.resolve(message.author)
        await member.roles.add(VERIFIED_ROLE)
        console.log(`User ${message.author.tag} successfully verified`)
        return true
    }

    roleMessages(message) {
        async function createRoleMessage (title, class_to_role) {
            const selectionMessage = await message.channel.send(title)
            MESSAGE_IDS.push(selectionMessage.id)
            const rawComparator = (a, b) => {
                function raw(s) {
                    return s.replace(/[a-z_]/, '')
                }
                return raw(a) - raw(b)
            }
            for (let emojiName of Object.keys(class_to_role).sort(rawComparator)) {
                try {
                    const emoji = message.guild.emojis.cache.find(emoji => emoji.name === emojiName)
                    await selectionMessage.react(emoji.id)
                } catch (error) {
                    console.log(`Emoji needed for ${emojiName} (${title})`)
                }
            }
        }
        Promise.all([
          createRoleMessage("EECS Lower Division", CLASS_TO_ROLE.LD),
          createRoleMessage("CS Upper Division", CLASS_TO_ROLE.CSUD),
          createRoleMessage("EE Upper Division", CLASS_TO_ROLE.EEUD),
        ])
    }
    
    react_to_role(guild, react_name) {
        for (let d in CLASS_TO_ROLE) {
            const division = CLASS_TO_ROLE[d]
            if (Object.keys(division).includes(react_name)) {
                return guild.roles.cache.find(role => role.name === division[react_name])
            }
        }
        return null
    }
}

const BotCmds = new BotCommands()
client.login(process.env.TOKEN)

client.once('ready', () => {
    console.log('\x1b[36m%s\x1b[0m', 'bot active!')
    GUILD = client.guilds.resolve(process.env.GUILD_ID)
    VERIFIED_ROLE = GUILD.roles.cache.find(role => role.name === process.env.VERIFIED_ROLE_NAME)
    ADMIN_ROLE = GUILD.roles.cache.find(role => role.name === process.env.ADMIN_ROLE_NAME)
})

client.on('error', e => console.error(e))
client.on('warn', e => console.warn(e))

client.on('message', message => {
    if (message.author.bot || !message.content.startsWith(process.env.PREFIX)) return
    const args = message.content.slice(process.env.PREFIX.length).split(/\s+/)
    const commandName = args.shift().toLowerCase()
    if (!commandName.length) return

    return message.channel.type === 'dm' ? BotCmds.dmCommand(message, commandName, args) :
                                            BotCmds.regCommand(message, commandName, args)
})

client.on('messageReactionAdd', (messageReaction, user) => {
    if (!MESSAGE_IDS.length || user.bot) return
    const message = messageReaction.message
    if (MESSAGE_IDS.includes(message.id)) {
        const role = BotCmds.react_to_role(message.guild, messageReaction.emoji.name)
        if (role) {
            const member = message.guild.members.resolve(user)
            member.roles.add(role)
        }
    }
})

client.on('messageReactionRemove', (messageReaction, user) => {
    if (!MESSAGE_IDS.length || user.bot) return
    const message = messageReaction.message
    if (MESSAGE_IDS.includes(message.id)) {
        const role = BotCmds.react_to_role(message.guild, messageReaction.emoji.name)
        if (role) {
            const member = message.guild.members.resolve(user)
            member.roles.remove(role)
        }
    }
})
