#!/usr/bin/env node

'use strict';

const { Command } = require('commander');
const ZhixiaNode = require('../src/node/zhixia-node');

const program = new Command();

program
    .name('zhixia')
    .description('Zhixia Pure P2P Network Tool')
    .version('2.0.0-alpha');

program
    .command('start')
    .description('Start Zhixia Node process')
    .option('-n, --name <name>', 'Node name', 'node-1')
    .option('-p, --port <port>', 'Binding port', '9001')
    .option('--tor', 'Enable Tor SOCKS fallback', false)
    .action(async (options) => {
        const node = new ZhixiaNode({
            name: options.name,
            port: Number(options.port),
            tor: options.tor
        });

        await node.start();

        node.message.router.register('CHAT', async (msg) => {
            console.log(`\n[MESSAGE RECEIVED] From: ${msg.from}`);
            console.log(`Payload: ${msg.payload.text}\n> `);
        });

        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const promptUser = () => {
            readline.question('> ', async (input) => {
                const parts = input.trim().split(' ');
                const cmd = parts[0];

                if (cmd === 'peers') {
                    console.log(JSON.stringify(node.peers.list(), null, 2));
                } else if (cmd === 'status') {
                    console.log({
                        id: node.identity.id,
                        port: node.port,
                        knownPeers: node.peers.list().length,
                        nat: node.connection.nat.getInfo()
                    });
                } else if (cmd === 'send') {
                    const target = parts[1];
                    const msgText = parts.slice(2).join(' ');
                    try {
                        await node.sendMessage(target, msgText);
                        console.log('[cli] Message dispatched directly.');
                    } catch (err) {
                        console.error(`[cli] Error: ${err.message}`);
                    }
                } else if (cmd === 'exit') {
                    await node.stop();
                    process.exit(0);
                } else if (cmd === 'help') {
                    console.log('Commands: peers, status, send <peerId> <text>, exit');
                }
                promptUser();
            });
        };

        promptUser();
    });

program.parse();