// Minimal dependency-free WebSocket server implementation (RFC 6455).
// Supports text frames, ping/pong, and close frames - enough for a JSON game protocol.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { logger } from './logger.js';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODES = { CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA };

function acceptKeyFor(clientKey) {
  return crypto.createHash('sha1').update(clientKey + WS_MAGIC).digest('base64');
}

function encodeFrame(opcode, payload) {
  const payloadBuf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = payloadBuf.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payloadBuf]);
}

class WSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.isAlive = true;
    this._buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this.emit('close'));
    socket.on('error', (err) => this.emit('error', err));
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    this._processBuffer();
  }

  _processBuffer() {
    while (true) {
      const frame = this._tryParseFrame(this._buffer);
      if (!frame) return;
      this._buffer = this._buffer.subarray(frame.frameLength);
      this._handleFrame(frame);
    }
  }

  _tryParseFrame(buf) {
    if (buf.length < 2) return null;

    const firstByte = buf[0];
    const secondByte = buf[1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (buf.length < offset + 2) return null;
      payloadLen = buf.readUInt16BE(offset);
      offset += 2;
    } else if (payloadLen === 127) {
      if (buf.length < offset + 8) return null;
      payloadLen = Number(buf.readBigUInt64BE(offset));
      offset += 8;
    }

    let maskKey = null;
    if (masked) {
      if (buf.length < offset + 4) return null;
      maskKey = buf.subarray(offset, offset + 4);
      offset += 4;
    }

    if (buf.length < offset + payloadLen) return null;

    let payload = buf.subarray(offset, offset + payloadLen);
    if (masked) {
      const unmasked = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        unmasked[i] = payload[i] ^ maskKey[i % 4];
      }
      payload = unmasked;
    }

    return { opcode, payload: Buffer.from(payload), frameLength: offset + payloadLen };
  }

  _handleFrame(frame) {
    switch (frame.opcode) {
      case OPCODES.TEXT:
        this.emit('message', frame.payload.toString('utf8'));
        break;
      case OPCODES.PING:
        this._send(OPCODES.PONG, frame.payload);
        break;
      case OPCODES.PONG:
        this.isAlive = true;
        break;
      case OPCODES.CLOSE:
        this._send(OPCODES.CLOSE, frame.payload);
        this.socket.end();
        break;
      default:
        break;
    }
  }

  _send(opcode, payload = Buffer.alloc(0)) {
    if (this.socket.writable) {
      this.socket.write(encodeFrame(opcode, payload));
    }
  }

  send(data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this._send(OPCODES.TEXT, payload);
  }

  ping() {
    this.isAlive = false;
    this._send(OPCODES.PING);
  }

  close() {
    this._send(OPCODES.CLOSE);
    this.socket.end();
  }
}

export class WebSocketServer extends EventEmitter {
  constructor(httpServer) {
    super();
    httpServer.on('upgrade', (req, socket) => this._handleUpgrade(req, socket));
  }

  _handleUpgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !key) {
      socket.destroy();
      return;
    }

    const acceptKey = acceptKeyFor(key);
    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n'
    ].join('\r\n');

    socket.write(responseHeaders);

    const connection = new WSConnection(socket);
    connection.on('error', (err) => logger.warn('WebSocket connection error:', err.message));
    this.emit('connection', connection, req);
  }
}
