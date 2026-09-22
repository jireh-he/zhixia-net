// 帧协议：防粘包/拆包
// [1 byte type][4 bytes length][N bytes payload]

const MSG_TYPE_JSON = 0x01;
const MSG_TYPE_BINARY = 0x02;
const MAX_FRAME_SIZE = 50 * 1024 * 1024; // 50MB

class FrameEncoder {
  static encode(type, payload) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error('Payload must be a Buffer');
    }
    if (payload.length > MAX_FRAME_SIZE) {
      throw new Error(`Frame too large: ${payload.length} > ${MAX_FRAME_SIZE}`);
    }
    const header = Buffer.allocUnsafe(5);
    header[0] = type;
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
  }

  static encodeJson(obj) {
    return FrameEncoder.encode(MSG_TYPE_JSON, Buffer.from(JSON.stringify(obj), 'utf8'));
  }

  static encodeBinary(buf) {
    return FrameEncoder.encode(MSG_TYPE_BINARY, buf);
  }
}

class FrameDecoder {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.state = 'header_type';
    this.expectedType = null;
    this.expectedLen = 0;
  }

  feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];

    while (true) {
      if (this.state === 'header_type') {
        if (this.buffer.length < 1) break;
        this.expectedType = this.buffer[0];
        this.buffer = this.buffer.slice(1);
        this.state = 'header_len';
      }

      if (this.state === 'header_len') {
        if (this.buffer.length < 4) break;
        this.expectedLen = this.buffer.readUInt32BE(0);
        if (this.expectedType === MSG_TYPE_BINARY && this.expectedLen > MAX_FRAME_SIZE) {
          throw new Error(`Binary frame too large: ${this.expectedLen}`);
        }
        this.buffer = this.buffer.slice(4);
        this.state = 'payload';
      }

      if (this.state === 'payload') {
        if (this.buffer.length < this.expectedLen) break;
        const payload = this.buffer.slice(0, this.expectedLen);
        this.buffer = this.buffer.slice(this.expectedLen);
        this.state = 'header_type';

        if (this.expectedType === MSG_TYPE_JSON) {
          try {
            frames.push({ type: 'json', data: JSON.parse(payload.toString('utf8')) });
          } catch (e) {
            frames.push({ type: 'json_error', error: e.message, raw: payload.toString('utf8').slice(0, 200) });
          }
        } else {
          frames.push({ type: 'binary', data: payload });
        }
      }
    }

    return frames;
  }

  reset() {
    this.buffer = Buffer.alloc(0);
    this.state = 'header_type';
    this.expectedType = null;
    this.expectedLen = 0;
  }
}

module.exports = {
  FrameEncoder,
  FrameDecoder,
  MSG_TYPE_JSON,
  MSG_TYPE_BINARY,
  MAX_FRAME_SIZE
};
