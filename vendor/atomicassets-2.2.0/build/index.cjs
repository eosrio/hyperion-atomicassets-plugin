"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/float.js
var require_float = __commonJS({
  "lib/float.js"(exports2, module2) {
    "use strict";
    var isBigeCpu = false;
    var readFloat32Array;
    var writeFloat32Array;
    var readFloat32ArrayRev;
    var writeFloat32ArrayRev;
    var readFloat64Array;
    var writeFloat64Array;
    var readFloat64ArrayRev;
    var writeFloat64ArrayRev;
    typeof Float32Array === "function" && (function() {
      var _fp32 = new Float32Array(1);
      var _b32 = new Uint8Array(_fp32.buffer);
      _fp32[0] = -1;
      isBigeCpu = _b32[3] === 0;
      readFloat32Array = function readFloat32Array2(buf, pos) {
        pos = pos || 0;
        if (pos < 0 || pos + 4 > buf.length) return 0;
        _b32[0] = buf[pos++];
        _b32[1] = buf[pos++];
        _b32[2] = buf[pos++];
        _b32[3] = buf[pos];
        return _fp32[0];
      };
      readFloat32ArrayRev = function readFloat32ArrayRev2(buf, pos) {
        pos = pos || 0;
        if (pos < 0 || pos + 4 > buf.length) return 0;
        _b32[3] = buf[pos++];
        _b32[2] = buf[pos++];
        _b32[1] = buf[pos++];
        _b32[0] = buf[pos];
        return _fp32[0];
      };
      writeFloat32Array = function writeFloat32Array2(buf, v, pos) {
        pos = pos || 0;
        _fp32[0] = v;
        buf[pos++] = _b32[0];
        buf[pos++] = _b32[1];
        buf[pos++] = _b32[2];
        buf[pos] = _b32[3];
      };
      writeFloat32ArrayRev = function writeFloat32ArrayRev2(buf, v, pos) {
        pos = pos || 0;
        _fp32[0] = v;
        buf[pos++] = _b32[3];
        buf[pos++] = _b32[2];
        buf[pos++] = _b32[1];
        buf[pos] = _b32[0];
      };
    })();
    typeof Float64Array === "function" && (function() {
      var _fp64 = new Float64Array(1);
      var _b64 = new Uint8Array(_fp64.buffer);
      readFloat64Array = function readFloat64Array2(buf, pos) {
        pos = pos || 0;
        if (pos < 0 || pos + 8 > buf.length) return 0;
        _b64[0] = buf[pos + 0];
        _b64[1] = buf[pos + 1];
        _b64[2] = buf[pos + 2];
        _b64[3] = buf[pos + 3];
        _b64[4] = buf[pos + 4];
        _b64[5] = buf[pos + 5];
        _b64[6] = buf[pos + 6];
        _b64[7] = buf[pos + 7];
        return _fp64[0];
      };
      readFloat64ArrayRev = function readFloat64ArrayRev2(buf, pos) {
        pos = pos || 0;
        if (pos < 0 || pos + 8 > buf.length) return 0;
        _b64[7] = buf[pos + 0];
        _b64[6] = buf[pos + 1];
        _b64[5] = buf[pos + 2];
        _b64[4] = buf[pos + 3];
        _b64[3] = buf[pos + 4];
        _b64[2] = buf[pos + 5];
        _b64[1] = buf[pos + 6];
        _b64[0] = buf[pos + 7];
        return _fp64[0];
      };
      writeFloat64Array = function writeFloat64Array2(buf, v, pos) {
        pos = pos || 0;
        _fp64[0] = v;
        buf[pos + 0] = _b64[0];
        buf[pos + 1] = _b64[1];
        buf[pos + 2] = _b64[2];
        buf[pos + 3] = _b64[3];
        buf[pos + 4] = _b64[4];
        buf[pos + 5] = _b64[5];
        buf[pos + 6] = _b64[6];
        buf[pos + 7] = _b64[7];
      };
      writeFloat64ArrayRev = function writeFloat64ArrayRev2(buf, v, pos) {
        pos = pos || 0;
        _fp64[0] = v;
        buf[pos + 0] = _b64[7];
        buf[pos + 1] = _b64[6];
        buf[pos + 2] = _b64[5];
        buf[pos + 3] = _b64[4];
        buf[pos + 4] = _b64[3];
        buf[pos + 5] = _b64[2];
        buf[pos + 6] = _b64[1];
        buf[pos + 7] = _b64[0];
      };
    })();
    function readWord(buf, offs, dirn) {
      var a = buf[offs++], b = buf[offs++], c = buf[offs++], d = buf[offs];
      return dirn === "bige" ? ((a * 256 + b) * 256 + c) * 256 + d : ((d * 256 + c) * 256 + b) * 256 + a;
    }
    function writeWord(buf, v, offs, dirn) {
      var a = v >>> 24 & 255, b = v >> 16 & 255, c = v >> 8 & 255, d = v & 255;
      dirn === "bige" ? (buf[offs++] = a, buf[offs++] = b, buf[offs++] = c, buf[offs] = d) : (buf[offs++] = d, buf[offs++] = c, buf[offs++] = b, buf[offs] = a);
    }
    function writeDoubleWord(buf, hi, lo, offs, dirn) {
      if (dirn === "bige") {
        writeWord(buf, hi, offs, dirn);
        writeWord(buf, lo, offs + 4, dirn);
      } else {
        writeWord(buf, lo, offs, dirn);
        writeWord(buf, hi, offs + 4, dirn);
      }
    }
    var _2eXp = new Array();
    for (i = 0; i < 1200; i++) _2eXp[i] = Math.pow(2, i);
    var i;
    var _2eXn = new Array();
    for (i = 0; i < 1200; i++) _2eXn[i] = Math.pow(2, -i);
    var i;
    function pow2(exp) {
      return exp >= 0 ? _2eXp[exp] : _2eXn[-exp];
    }
    var _rshift32 = 1 / 4294967296;
    var _rshift20 = 1 / 1048576;
    var _lshift32 = 1 * 4294967296;
    var _rshift52 = 1 * _rshift32 * _rshift20;
    var _rshift1023 = pow2(-1023);
    function readDouble(buf, offset, dirn) {
      var w0 = readWord(buf, offset, dirn);
      var w1 = readWord(buf, offset + 4, dirn);
      var highWord, lowWord;
      dirn === "bige" ? (highWord = w0, lowWord = w1) : (highWord = w1, lowWord = w0);
      var mantissa = (highWord & 1048575) * _lshift32 + lowWord;
      var exponent = (highWord & 2146435072) >>> 20;
      var sign = highWord >> 31 || 1;
      var value;
      if (exponent === 0) {
        value = mantissa ? mantissa * pow2(-52 + 1 - 1023) : 0;
      } else if (exponent < 2047) {
        value = mantissa >= 0 ? (1 + mantissa * _rshift52) * pow2(exponent - 1023) : 0;
      } else {
        value = mantissa ? NaN : Infinity;
      }
      return sign * value;
    }
    var _rshift23 = Math.pow(2, -23);
    var _rshift127 = Math.pow(2, -127);
    function readFloat(buf, offset, dirn) {
      var word = readWord(buf, offset, dirn);
      var mantissa = word & 8388607;
      var exponent = (word & 2139095040) >>> 23;
      var sign = word >> 31 || 1;
      var value;
      if (exponent === 0) {
        value = mantissa ? mantissa * _rshift23 * 2 * _rshift127 : 0;
      } else if (exponent < 255) {
        value = (1 + mantissa * _rshift23) * pow2(exponent - 127);
      } else {
        value = mantissa ? NaN : Infinity;
      }
      return sign * value;
    }
    var _parts = { exp: 0, mant: 0 };
    function normalize(v) {
      var exp = 0;
      if (v >= 2) {
        exp = countDoublings(1, v);
        v *= pow2(-exp);
        if (v >= 2) {
          v /= 2;
          exp += 1;
        }
      } else if (v < 1) {
        exp = countDoublings(v, 2);
        if (exp <= 1023) v *= pow2(exp);
        else {
          v *= pow2(exp - 100);
          v *= pow2(100);
        }
        exp = -exp;
      }
      _parts.exp = exp;
      _parts.mant = v;
      return _parts;
    }
    var _2e192 = Math.pow(2, 192);
    function countDoublings(a, b) {
      var n = 0;
      while (a * _2e192 < b) {
        a *= _2e192;
        n += 192;
      }
      while (a * 18446744073709552e3 < b) {
        a *= 18446744073709552e3;
        n += 64;
      }
      while (a * 65536 < b) {
        a *= 65536;
        n += 16;
      }
      while (a * 64 < b) {
        a *= 64;
        n += 6;
      }
      while (a * 2 < b) {
        a *= 2;
        n += 1;
      }
      return n;
    }
    function roundMantissa(v, scale) {
      v *= scale;
      return v - Math.floor(v) !== 0.5 || v & 1 ? v + 0.5 : v;
    }
    function writeFloat(buf, v, offset, dirn) {
      var norm, word, sign = 0;
      if (v < 0) {
        sign = 2147483648;
        v = -v;
      }
      if (!(v && v < Infinity)) {
        if (v === 0) {
          word = 1 / v < 0 ? 2147483648 : 0;
        } else if (v === Infinity) {
          word = sign | 2139095040;
        } else {
          word = 2143289344;
        }
        writeWord(buf, word, offset, dirn);
      } else {
        norm = normalize(v);
        norm.exp += 127;
        if (norm.exp <= 0) {
          if (norm.exp <= -25) {
            norm.mant = 0;
            norm.exp = 0;
          } else {
            norm.mant = roundMantissa(norm.mant, pow2(22 + norm.exp));
            norm.exp = 0;
            if (norm.mant >= 8388608) {
              norm.mant -= 8388608;
              norm.exp += 1;
            }
          }
        } else {
          norm.mant = roundMantissa(norm.mant - 1, 8388608);
          if (norm.mant >= 8388608) {
            norm.mant -= 8388608;
            norm.exp += 1;
          }
          if (norm.exp > 254) {
            norm.mant = 0;
            norm.exp = 255;
          }
        }
        word = sign | norm.exp << 23 | norm.mant;
        writeWord(buf, word, offset, dirn);
      }
    }
    var doubleBuf = new Uint8Array(8);
    var _2e52 = Math.pow(2, 52);
    function writeDouble(buf, v, offset, dirn) {
      var norm, highWord, lowWord, sign = 0;
      if (v < 0) {
        sign = 2147483648;
        v = -v;
      }
      if (!(v && v < Infinity)) {
        if (v === 0) {
          highWord = 1 / v < 0 ? 2147483648 : 0;
          lowWord = 0;
        } else if (v === Infinity) {
          highWord = sign + 2146435072;
          lowWord = 0;
        } else {
          highWord = 2146959360;
          lowWord = 0;
        }
        writeDoubleWord(buf, highWord, lowWord, offset, dirn);
      } else {
        norm = normalize(v);
        norm.exp += 1023;
        if (norm.exp <= 0) {
          norm.mant *= pow2(51 + norm.exp);
          norm.exp = 0;
        } else {
          norm.mant = (norm.mant - 1) * _2e52;
        }
        highWord = sign | norm.exp << 20 | norm.mant / 4294967296;
        lowWord = norm.mant >>> 0;
        writeDoubleWord(buf, highWord, lowWord, offset, dirn);
      }
    }
    (function install() {
      var exports3 = typeof module2 === "object" && module2.exports || this;
      exports3.readWord = readWord;
      exports3.writeWord = writeWord;
      exports3.writeDoubleWord = writeDoubleWord;
      exports3.readFloat = readFloat;
      exports3.writeFloat = writeFloat;
      exports3.readDouble = readDouble;
      exports3.writeDouble = writeDouble;
      exports3._useFloatArray = function(yesno) {
        exports3._usingFloatArray = yesno;
        if (yesno) {
          if (yesno == "full") exports3.readFloatLE = isBigeCpu ? readFloat32ArrayRev : readFloat32Array;
          exports3.writeFloatLE = isBigeCpu ? writeFloat32ArrayRev : writeFloat32Array;
          if (yesno == "full") exports3.readFloatBE = isBigeCpu ? readFloat32Array : readFloat32ArrayRev;
          exports3.writeFloatBE = isBigeCpu ? writeFloat32Array : writeFloat32ArrayRev;
          exports3.readDoubleLE = isBigeCpu ? readFloat64ArrayRev : readFloat64Array;
          exports3.writeDoubleLE = isBigeCpu ? writeFloat64ArrayRev : writeFloat64Array;
          exports3.readDoubleBE = isBigeCpu ? readFloat64Array : readFloat64ArrayRev;
          exports3.writeDoubleBE = isBigeCpu ? writeFloat64Array : writeFloat64ArrayRev;
        } else {
          exports3._usingFloatArray = "";
          exports3.readFloatLE = function readFloatLE(buf, offset) {
            return exports3.readFloat(buf, offset || 0, "le");
          };
          exports3.writeFloatLE = function writeFloatLE(buf, v, offset) {
            exports3.writeFloat(buf, v, offset || 0, "le");
          };
          exports3.readFloatBE = function readFloatBE(buf, offset) {
            return exports3.readFloat(buf, offset || 0, "bige");
          };
          exports3.writeFloatBE = function writeFloatBE(buf, v, offset) {
            exports3.writeFloat(buf, v, offset || 0, "bige");
          };
          exports3.readDoubleLE = function readDoubleLE(buf, offset) {
            return exports3.readDouble(buf, offset || 0, "le");
          };
          exports3.writeDoubleLE = function writeDoubleLE(buf, v, offset) {
            exports3.writeDouble(buf, v, offset || 0, "le");
          };
          exports3.readDoubleBE = function readDoubleBE(buf, offset) {
            return exports3.readDouble(buf, offset || 0, "bige");
          };
          exports3.writeDoubleBE = function writeDoubleLE(buf, v, offset) {
            exports3.writeDouble(buf, v, offset || 0, "bige");
          };
        }
      };
      exports3._getBigeCpu = function() {
        return isBigeCpu;
      };
      exports3._setBigeCpu = function(yesno) {
        isBigeCpu = yesno;
      };
      exports3._useFloatArray(false);
      exports3._useFloatArray(readFloat32Array && readFloat64Array && "fastest");
      install.prototype = exports3;
    }).call(exports2);
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  ATOMIC_ATTRIBUTE: () => ATOMIC_ATTRIBUTE,
  ActionBuilder: () => ActionBuilder,
  ActionGenerator: () => ActionGenerator,
  ApiError: () => ApiError,
  AssetsSort: () => AssetsSort,
  AtomicAssetsActionNames: () => AtomicAssetsActionNames,
  AtomicAssetsActions: () => AtomicAssetsActions,
  CachedObjectSchema: () => CachedObjectSchema,
  CollectionsSort: () => CollectionsSort,
  DeserializationError: () => DeserializationError,
  ExplorerActionGenerator: () => ExplorerActionGenerator,
  ExplorerApi: () => ExplorerApi,
  ExplorerError: () => RpcError2,
  NETWORK_ENDPOINTS: () => NETWORK_ENDPOINTS,
  ObjectSchema: () => ObjectSchema,
  OfferState: () => OfferState,
  OffersSort: () => OffersSort,
  OrderParam: () => OrderParam,
  ParserTypes: () => ParserTypes,
  RpcActionGenerator: () => RpcActionGenerator,
  RpcApi: () => RpcApi,
  RpcError: () => RpcError,
  SchemaError: () => SchemaError,
  SchemasSort: () => SchemasSort,
  SerializationError: () => SerializationError,
  TemplatesSort: () => TemplatesSort,
  TransfersSort: () => TransfersSort,
  convertAttributeMapToObject: () => convertAttributeMapToObject,
  createAttributeMap: () => createAttributeMap,
  deserialize: () => deserialize,
  explorerApiForNetwork: () => explorerApiForNetwork,
  mergeSchemaFormatTypes: () => mergeSchemaFormatTypes,
  rpcApiForNetwork: () => rpcApiForNetwork,
  serialize: () => serialize,
  toAttributeMap: () => toAttributeMap,
  toByteArray: () => toByteArray
});
module.exports = __toCommonJS(src_exports);

// src/Errors/SerializationError.ts
var SerializationError = class extends Error {
};

// src/Actions/Generator.ts
var ATOMIC_ATTRIBUTE = {
  int8: "int8",
  int16: "int16",
  int32: "int32",
  int64: "int64",
  uint8: "uint8",
  uint16: "uint16",
  uint32: "uint32",
  uint64: "uint64",
  fixed8: "uint8",
  fixed16: "uint16",
  fixed32: "uint32",
  fixed64: "uint64",
  float: "float32",
  double: "float64",
  string: "string",
  ipfs: "string",
  image: "string",
  bool: "uint8",
  "int8[]": "INT8_VEC",
  "int16[]": "INT16_VEC",
  "int32[]": "INT32_VEC",
  "int64[]": "INT64_VEC",
  "uint8[]": "UINT8_VEC",
  "uint16[]": "UINT16_VEC",
  "uint32[]": "UINT32_VEC",
  "uint64[]": "UINT64_VEC",
  "fixed8[]": "UINT8_VEC",
  "fixed16[]": "UINT16_VEC",
  "fixed32[]": "UINT32_VEC",
  "fixed64[]": "UINT64_VEC",
  "float[]": "FLOAT_VEC",
  "double[]": "DOUBLE_VEC",
  "string[]": "STRING_VEC",
  "image[]": "STRING_VEC",
  "bool[]": "INT8_VEC"
};
function createAttributeMap(obj, types) {
  const result = [];
  for (const key of Object.keys(obj)) {
    const type = types[key];
    if (typeof type === "undefined") {
      throw new SerializationError("no type given for field '" + key + "'");
    }
    const variant = ATOMIC_ATTRIBUTE[type];
    if (typeof variant === "undefined") {
      throw new SerializationError("invalid type '" + type + "' for field '" + key + "'");
    }
    result.push({ key, value: [variant, obj[key]] });
  }
  return result;
}
var INT32_MIN = -2147483648;
var INT32_MAX = 2147483647;
var UINT32_MAX = 4294967295;
function assertFinite(value, field) {
  if (!Number.isFinite(value)) {
    throw new SerializationError(`${field} ${String(value)} is not a finite number`);
  }
}
function assertInt32(value, field) {
  if (!Number.isInteger(value) || value < INT32_MIN || value > INT32_MAX) {
    throw new SerializationError(
      `${field} ${String(value)} is not an int32 (an integer ${INT32_MIN} to ${INT32_MAX})`
    );
  }
}
function assertUint32(value, field) {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new SerializationError(
      `${field} ${String(value)} is not a uint32 (an integer 0 to ${UINT32_MAX})`
    );
  }
}
var ActionBuilder = class {
  constructor(contract) {
    this.contract = contract;
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  acceptauswap(collection_name) {
    return this._action("acceptauswap", { collection_name });
  }
  acceptoffer(offer_id) {
    return this._action("acceptoffer", { offer_id });
  }
  addcolauth(collection_name, account_to_add) {
    return this._action("addcolauth", { collection_name, account_to_add });
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The builder still
   * emits it, for a caller that holds that authority.
   */
  addconftoken(token_contract, token_symbol) {
    return this._action("addconftoken", { token_contract, token_symbol });
  }
  addnotifyacc(collection_name, account_to_add) {
    return this._action("addnotifyacc", { collection_name, account_to_add });
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The builder still
   * emits it, for a caller that holds that authority.
   */
  admincoledit(collection_format_extension) {
    return this._action("admincoledit", { collection_format_extension });
  }
  announcedepo(owner, symbol_to_announce) {
    return this._action("announcedepo", { owner, symbol_to_announce });
  }
  // Native backing is gone from the version this package targets: v2
  // hard-disables the action behind a `check()` guard, so it aborts there.
  // It still executes on a chain that has not migrated, which is why a
  // caller may find it working and why it is deprecated rather than removed.
  // A successful call means the chain has not caught up yet, not that this
  // is a supported path to build on.
  /** @deprecated Native backing is disabled in AtomicAssets v2, where this action aborts. It still executes on chains that have not migrated. */
  backasset(payer, asset_owner, asset_id, token_to_back) {
    return this._action("backasset", { payer, asset_owner, asset_id, token_to_back });
  }
  burnasset(asset_owner, asset_id) {
    return this._action("burnasset", { asset_owner, asset_id });
  }
  canceloffer(offer_id) {
    return this._action("canceloffer", { offer_id });
  }
  // v2-only.
  //
  // `owner` picks the authority and the delay together, and they are not
  // independent. true requires the current author's `owner` permission and
  // sets the acceptance date to now, so the new author can accept
  // immediately; false takes `active` auth and adds AUTHOR_SWAP_TIME_DELTA,
  // a week under the deployed parameters, before acceptance is possible.
  // Either way the swap hands over the collection's authorship and cannot be
  // undone once accepted, and the contract never checks
  // is_account(new_author), so a misspelled name is stored as written.
  /**
   * @remarks v2-only action. `owner: true` requires the author's owner
   * permission and permits immediate acceptance; `false` uses active auth and
   * imposes the 7-day `AUTHOR_SWAP_TIME_DELTA`. Acceptance transfers
   * collection authorship irreversibly, and `new_author` is not checked for
   * existence.
   */
  createauswap(collection_name, new_author, owner) {
    return this._action("createauswap", { collection_name, new_author, owner });
  }
  createcol(author, collection_name, allow_notify, authorized_accounts, notify_accounts, market_fee, data) {
    assertFinite(market_fee, "market_fee");
    return this._action("createcol", {
      author,
      collection_name,
      allow_notify,
      authorized_accounts,
      notify_accounts,
      market_fee,
      data
    });
  }
  createoffer(sender, recipient, sender_asset_ids, recipient_asset_ids, memo) {
    return this._action("createoffer", { sender, recipient, sender_asset_ids, recipient_asset_ids, memo });
  }
  createtempl(authorized_creator, collection_name, schema_name, transferable, burnable, max_supply, immutable_data) {
    assertUint32(max_supply, "max_supply");
    return this._action("createtempl", {
      authorized_creator,
      collection_name,
      schema_name,
      transferable,
      burnable,
      max_supply,
      immutable_data
    });
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  createtempl2(authorized_creator, collection_name, schema_name, transferable, burnable, max_supply, immutable_data, mutable_data) {
    assertUint32(max_supply, "max_supply");
    return this._action("createtempl2", {
      authorized_creator,
      collection_name,
      schema_name,
      transferable,
      burnable,
      max_supply,
      immutable_data,
      mutable_data
    });
  }
  createschema(authorized_creator, collection_name, schema_name, schema_format) {
    return this._action("createschema", { authorized_creator, collection_name, schema_name, schema_format });
  }
  declineoffer(offer_id) {
    return this._action("declineoffer", { offer_id });
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  deltemplate(authorized_editor, collection_name, template_id) {
    assertInt32(template_id, "template_id");
    return this._action("deltemplate", { authorized_editor, collection_name, template_id });
  }
  extendschema(authorized_editor, collection_name, schema_name, schema_format_extension) {
    return this._action("extendschema", { authorized_editor, collection_name, schema_name, schema_format_extension });
  }
  forbidnotify(collection_name) {
    return this._action("forbidnotify", { collection_name });
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The builder still
   * emits it, for a caller that holds that authority.
   */
  init() {
    return this._action("init", {});
  }
  locktemplate(authorized_editor, collection_name, template_id) {
    assertInt32(template_id, "template_id");
    return this._action("locktemplate", { authorized_editor, collection_name, template_id });
  }
  // tokens_to_back carries the same deprecation as `backasset`, and it is
  // the easier of the two to walk into, because a caller steered off
  // `backasset` reaches for it next. v2 ends this action with
  // check(tokens_to_back.size() == 0), an unconditional abort, so a
  // non-empty vector fails there. A chain that has not migrated instead
  // loops the vector into internal_back_asset and spends the minter's
  // deposited balance on the backed tokens, with nothing in the result to
  // say the feature is going away. Pass [] and back nothing.
  /**
   * @remarks Native backing is deprecated. A non-empty `tokens_to_back`
   * aborts on AtomicAssets v2, and on a chain that has not migrated it still
   * backs the asset and charges the minter. Pass `[]`.
   */
  mintasset(authorized_minter, collection_name, schema_name, template_id, new_asset_owner, immutable_data, mutable_data, tokens_to_back) {
    assertInt32(template_id, "template_id");
    return this._action("mintasset", {
      authorized_minter,
      collection_name,
      schema_name,
      template_id,
      new_asset_owner,
      immutable_data,
      mutable_data,
      tokens_to_back
    });
  }
  payofferram(payer, offer_id) {
    return this._action("payofferram", { payer, offer_id });
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  redtemplmax(authorized_editor, collection_name, template_id, new_max_supply) {
    assertInt32(template_id, "template_id");
    assertUint32(new_max_supply, "new_max_supply");
    return this._action("redtemplmax", { authorized_editor, collection_name, template_id, new_max_supply });
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  rejectauswap(collection_name) {
    return this._action("rejectauswap", { collection_name });
  }
  remcolauth(collection_name, account_to_remove) {
    return this._action("remcolauth", { collection_name, account_to_remove });
  }
  remnotifyacc(collection_name, account_to_remove) {
    return this._action("remnotifyacc", { collection_name, account_to_remove });
  }
  // new_mutable_data becomes the asset's entire mutable data map. The
  // contract serializes exactly what it is handed, so an attribute left out
  // is dropped rather than preserved, and nothing on chain compares the map
  // against what was there. Read the asset's current mutable data and merge
  // into it; a read-modify-write that skips the merge destroys the omitted
  // attributes and reports success.
  /**
   * @remarks `new_mutable_data` replaces the asset's whole mutable data map.
   * Any attribute omitted is silently dropped, so merge into the current data
   * rather than sending a partial map.
   */
  setassetdata(authorized_editor, asset_owner, asset_id, new_mutable_data) {
    return this._action("setassetdata", { authorized_editor, asset_owner, asset_id, new_mutable_data });
  }
  // `data` becomes the collection's entire data map. The contract serializes
  // exactly what it is handed over the existing row, so an attribute left
  // out of the map is dropped, not preserved. Read the current data and
  // merge into it; no contract check compares the two, so a
  // read-modify-write that forgets to merge destroys the omitted attributes
  // and reports success.
  /**
   * @remarks `data` replaces the collection's whole data map. Any attribute
   * omitted is silently dropped, so merge into the current data rather than
   * sending a partial map.
   */
  setcoldata(collection_name, data) {
    return this._action("setcoldata", { collection_name, data });
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  setlastpayer(owner, collection_name) {
    return this._action("setlastpayer", { owner, collection_name });
  }
  setmarketfee(collection_name, market_fee) {
    assertFinite(market_fee, "market_fee");
    return this._action("setmarketfee", { collection_name, market_fee });
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  setrampayer(new_payer, asset_id) {
    return this._action("setrampayer", { new_payer, asset_id });
  }
  // v2-only.
  //
  // new_mutable_data becomes the template's entire mutable data map, and an
  // attribute left out is dropped rather than preserved. The empty map is
  // the sharpest version of that: the contract reads it as "no mutable data"
  // and erases the templates2 row outright. Read the current data and merge
  // into it; nothing on chain distinguishes a deliberate clear from a
  // partial map sent by mistake.
  /**
   * @remarks v2-only action. `new_mutable_data` replaces the template's whole
   * mutable data map, and an empty map erases the row. Any attribute omitted
   * is silently dropped, so merge into the current data.
   */
  settempldata(authorized_editor, collection_name, template_id, new_mutable_data) {
    assertInt32(template_id, "template_id");
    return this._action("settempldata", { authorized_editor, collection_name, template_id, new_mutable_data });
  }
  // v2-only.
  //
  // schema_format_type becomes the schema's entire media-type list: the
  // contract assigns the vector over the stored one, so a field left out
  // loses the hint it had. The contract checks that each entry names a field
  // the schema format defines and that no name repeats, but it never
  // compares the vector against what was stored, so an omission is not an
  // error. Read the existing types and merge into them.
  /**
   * @remarks v2-only action. `schema_format_type` replaces the schema's whole
   * media-type list; a field omitted loses its existing hint. Merge into the
   * current types rather than sending a partial list.
   */
  setschematyp(authorized_editor, collection_name, schema_name, schema_format_type) {
    const normalized = schema_format_type.map(
      ({ name, mediatype, info }) => ({ name, mediatype, info: info ?? "" })
    );
    return this._action("setschematyp", {
      authorized_editor,
      collection_name,
      schema_name,
      schema_format_type: normalized
    });
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The builder still
   * emits it, for a caller that holds that authority.
   */
  setversion(new_version) {
    return this._action("setversion", { new_version });
  }
  transfer(from, to, asset_ids, memo) {
    return this._action("transfer", { from, to, asset_ids, memo });
  }
  withdraw(owner, token_to_withdraw) {
    return this._action("withdraw", { owner, token_to_withdraw });
  }
  _action(name, data) {
    return { account: this.contract, name, data };
  }
};
var ActionGenerator = class {
  constructor(contract) {
    this.contract = contract;
    this.builder = new ActionBuilder(contract);
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  async acceptauswap(authorization, collection_name) {
    return this._authorize(authorization, this.builder.acceptauswap(collection_name));
  }
  async acceptoffer(authorization, offer_id) {
    return this._authorize(authorization, this.builder.acceptoffer(offer_id));
  }
  async addcolauth(authorization, collection_name, account_to_add) {
    return this._authorize(authorization, this.builder.addcolauth(collection_name, account_to_add));
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The generator still
   * emits it, for a caller that holds that authority.
   */
  async addconftoken(authorization, token_contract, token_symbol) {
    return this._authorize(authorization, this.builder.addconftoken(token_contract, token_symbol));
  }
  async addnotifyacc(authorization, collection_name, account_to_add) {
    return this._authorize(authorization, this.builder.addnotifyacc(collection_name, account_to_add));
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The generator still
   * emits it, for a caller that holds that authority.
   */
  async admincoledit(authorization, collection_format_extension) {
    return this._authorize(authorization, this.builder.admincoledit(collection_format_extension));
  }
  async announcedepo(authorization, owner, symbol_to_announce) {
    return this._authorize(authorization, this.builder.announcedepo(owner, symbol_to_announce));
  }
  // Native backing is gone from the version this package targets: v2
  // hard-disables the action behind a `check()` guard, so it aborts there.
  // It still executes on a chain that has not migrated, which is why a
  // caller may find it working and why it is deprecated rather than removed.
  // A successful call means the chain has not caught up yet, not that this
  // is a supported path to build on.
  /** @deprecated Native backing is disabled in AtomicAssets v2, where this action aborts. It still executes on chains that have not migrated. */
  async backasset(authorization, payer, asset_owner, asset_id, token_to_back) {
    return this._authorize(authorization, this.builder.backasset(payer, asset_owner, asset_id, token_to_back));
  }
  async burnasset(authorization, asset_owner, asset_id) {
    return this._authorize(authorization, this.builder.burnasset(asset_owner, asset_id));
  }
  async canceloffer(authorization, offer_id) {
    return this._authorize(authorization, this.builder.canceloffer(offer_id));
  }
  // v2-only.
  //
  // `owner` picks the authority and the delay together, and they are not
  // independent. true requires the current author's `owner` permission and
  // sets the acceptance date to now, so the new author can accept
  // immediately; false takes `active` auth and adds AUTHOR_SWAP_TIME_DELTA,
  // a week under the deployed parameters, before acceptance is possible.
  // Either way the swap hands over the collection's authorship and cannot be
  // undone once accepted, and the contract never checks
  // is_account(new_author), so a misspelled name is stored as written.
  /**
   * @remarks v2-only action. `owner: true` requires the author's owner
   * permission and permits immediate acceptance; `false` uses active auth and
   * imposes the 7-day `AUTHOR_SWAP_TIME_DELTA`. Acceptance transfers
   * collection authorship irreversibly, and `new_author` is not checked for
   * existence.
   */
  async createauswap(authorization, collection_name, new_author, owner) {
    return this._authorize(authorization, this.builder.createauswap(collection_name, new_author, owner));
  }
  async createcol(authorization, author, collection_name, allow_notify, authorized_accounts, notify_accounts, market_fee, data) {
    return this._authorize(authorization, this.builder.createcol(
      author,
      collection_name,
      allow_notify,
      authorized_accounts,
      notify_accounts,
      market_fee,
      data
    ));
  }
  async createoffer(authorization, sender, recipient, sender_asset_ids, recipient_asset_ids, memo) {
    return this._authorize(authorization, this.builder.createoffer(sender, recipient, sender_asset_ids, recipient_asset_ids, memo));
  }
  async createtempl(authorization, authorized_creator, collection_name, schema_name, transferable, burnable, max_supply, immutable_data) {
    return this._authorize(authorization, this.builder.createtempl(
      authorized_creator,
      collection_name,
      schema_name,
      transferable,
      burnable,
      max_supply,
      immutable_data
    ));
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  async createtempl2(authorization, authorized_creator, collection_name, schema_name, transferable, burnable, max_supply, immutable_data, mutable_data) {
    return this._authorize(authorization, this.builder.createtempl2(
      authorized_creator,
      collection_name,
      schema_name,
      transferable,
      burnable,
      max_supply,
      immutable_data,
      mutable_data
    ));
  }
  async createschema(authorization, authorized_creator, collection_name, schema_name, schema_format) {
    return this._authorize(authorization, this.builder.createschema(authorized_creator, collection_name, schema_name, schema_format));
  }
  async declineoffer(authorization, offer_id) {
    return this._authorize(authorization, this.builder.declineoffer(offer_id));
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  async deltemplate(authorization, authorized_editor, collection_name, template_id) {
    return this._authorize(authorization, this.builder.deltemplate(authorized_editor, collection_name, template_id));
  }
  async extendschema(authorization, authorized_editor, collection_name, schema_name, schema_format_extension) {
    return this._authorize(authorization, this.builder.extendschema(
      authorized_editor,
      collection_name,
      schema_name,
      schema_format_extension
    ));
  }
  async forbidnotify(authorization, collection_name) {
    return this._authorize(authorization, this.builder.forbidnotify(collection_name));
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The generator still
   * emits it, for a caller that holds that authority.
   */
  async init(authorization) {
    return this._authorize(authorization, this.builder.init());
  }
  async locktemplate(authorization, authorized_editor, collection_name, template_id) {
    return this._authorize(authorization, this.builder.locktemplate(authorized_editor, collection_name, template_id));
  }
  // tokens_to_back carries the same deprecation as `backasset`, and it is
  // the easier of the two to walk into, because a caller steered off
  // `backasset` reaches for it next. v2 ends this action with
  // check(tokens_to_back.size() == 0), an unconditional abort, so a
  // non-empty vector fails there. A chain that has not migrated instead
  // loops the vector into internal_back_asset and spends the minter's
  // deposited balance on the backed tokens, with nothing in the result to
  // say the feature is going away. Pass [] and back nothing.
  /**
   * @remarks Native backing is deprecated. A non-empty `tokens_to_back`
   * aborts on AtomicAssets v2, and on a chain that has not migrated it still
   * backs the asset and charges the minter. Pass `[]`.
   */
  async mintasset(authorization, authorized_minter, collection_name, schema_name, template_id, new_asset_owner, immutable_data, mutable_data, tokens_to_back) {
    return this._authorize(authorization, this.builder.mintasset(
      authorized_minter,
      collection_name,
      schema_name,
      template_id,
      new_asset_owner,
      immutable_data,
      mutable_data,
      tokens_to_back
    ));
  }
  async payofferram(authorization, payer, offer_id) {
    return this._authorize(authorization, this.builder.payofferram(payer, offer_id));
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  async redtemplmax(authorization, authorized_editor, collection_name, template_id, new_max_supply) {
    return this._authorize(authorization, this.builder.redtemplmax(authorized_editor, collection_name, template_id, new_max_supply));
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  async rejectauswap(authorization, collection_name) {
    return this._authorize(authorization, this.builder.rejectauswap(collection_name));
  }
  async remcolauth(authorization, collection_name, account_to_remove) {
    return this._authorize(authorization, this.builder.remcolauth(collection_name, account_to_remove));
  }
  async remnotifyacc(authorization, collection_name, account_to_remove) {
    return this._authorize(authorization, this.builder.remnotifyacc(collection_name, account_to_remove));
  }
  // new_mutable_data becomes the asset's entire mutable data map. The
  // contract serializes exactly what it is handed, so an attribute left out
  // is dropped rather than preserved, and nothing on chain compares the map
  // against what was there. Read the asset's current mutable data and merge
  // into it; a read-modify-write that skips the merge destroys the omitted
  // attributes and reports success.
  /**
   * @remarks `new_mutable_data` replaces the asset's whole mutable data map.
   * Any attribute omitted is silently dropped, so merge into the current data
   * rather than sending a partial map.
   */
  async setassetdata(authorization, authorized_editor, asset_owner, asset_id, new_mutable_data) {
    return this._authorize(authorization, this.builder.setassetdata(authorized_editor, asset_owner, asset_id, new_mutable_data));
  }
  // `data` becomes the collection's entire data map. The contract serializes
  // exactly what it is handed over the existing row, so an attribute left
  // out of the map is dropped, not preserved. Read the current data and
  // merge into it; no contract check compares the two, so a
  // read-modify-write that forgets to merge destroys the omitted attributes
  // and reports success.
  /**
   * @remarks `data` replaces the collection's whole data map. Any attribute
   * omitted is silently dropped, so merge into the current data rather than
   * sending a partial map.
   */
  async setcoldata(authorization, collection_name, data) {
    return this._authorize(authorization, this.builder.setcoldata(collection_name, data));
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  async setlastpayer(authorization, owner, collection_name) {
    return this._authorize(authorization, this.builder.setlastpayer(owner, collection_name));
  }
  async setmarketfee(authorization, collection_name, market_fee) {
    return this._authorize(authorization, this.builder.setmarketfee(collection_name, market_fee));
  }
  /** @remarks v2-only action: a chain that has not migrated rejects it as unknown. */
  async setrampayer(authorization, new_payer, asset_id) {
    return this._authorize(authorization, this.builder.setrampayer(new_payer, asset_id));
  }
  // v2-only.
  //
  // new_mutable_data becomes the template's entire mutable data map, and an
  // attribute left out is dropped rather than preserved. The empty map is
  // the sharpest version of that: the contract reads it as "no mutable data"
  // and erases the templates2 row outright. Read the current data and merge
  // into it; nothing on chain distinguishes a deliberate clear from a
  // partial map sent by mistake.
  /**
   * @remarks v2-only action. `new_mutable_data` replaces the template's whole
   * mutable data map, and an empty map erases the row. Any attribute omitted
   * is silently dropped, so merge into the current data.
   */
  async settempldata(authorization, authorized_editor, collection_name, template_id, new_mutable_data) {
    return this._authorize(authorization, this.builder.settempldata(authorized_editor, collection_name, template_id, new_mutable_data));
  }
  // v2-only.
  //
  // schema_format_type becomes the schema's entire media-type list: the
  // contract assigns the vector over the stored one, so a field left out
  // loses the hint it had. The contract checks that each entry names a field
  // the schema format defines and that no name repeats, but it never
  // compares the vector against what was stored, so an omission is not an
  // error. Read the existing types and merge into them.
  /**
   * @remarks v2-only action. `schema_format_type` replaces the schema's whole
   * media-type list; a field omitted loses its existing hint. Merge into the
   * current types rather than sending a partial list.
   */
  async setschematyp(authorization, authorized_editor, collection_name, schema_name, schema_format_type) {
    return this._authorize(authorization, this.builder.setschematyp(
      authorized_editor,
      collection_name,
      schema_name,
      schema_format_type
    ));
  }
  /**
   * @remarks Contract administration: guarded by `require_auth(get_self())`,
   * so only the contract account itself can execute it. The generator still
   * emits it, for a caller that holds that authority.
   */
  async setversion(authorization, new_version) {
    return this._authorize(authorization, this.builder.setversion(new_version));
  }
  async transfer(authorization, from, to, asset_ids, memo) {
    return this._authorize(authorization, this.builder.transfer(from, to, asset_ids, memo));
  }
  async withdraw(authorization, owner, token_to_withdraw) {
    return this._authorize(authorization, this.builder.withdraw(owner, token_to_withdraw));
  }
  _authorize(authorization, action) {
    return [{ account: action.account, name: action.name, authorization, data: action.data }];
  }
  /** @deprecated Unused by the generator itself and kept only so subclasses compiled against it keep working. Removal waits for the next major. */
  _pack(authorization, name, data) {
    return [{ account: this.contract, name, authorization, data }];
  }
};
function toAttributeMap(obj, schema) {
  const types = {};
  const result = [];
  for (const row of schema) {
    types[row.name] = row.type;
  }
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (typeof types[key] === "undefined") {
      throw new SerializationError("field not defined in schema");
    }
    result.push({ key, value: [types[key], obj[key]] });
  }
  return result;
}
function coerceFloatValue(value, float32) {
  if (typeof value !== "string" || value.trim() === "") {
    return value;
  }
  const parsed = Number(value);
  const rounded = float32 ? Math.fround(parsed) : parsed;
  if (!Number.isFinite(rounded) || rounded === 0 && /[1-9]/.test(value.split(/[eE]/)[0])) {
    return value;
  }
  return rounded;
}
function convertAttributeMapToObject(data) {
  const result = {};
  for (const row of data) {
    const key = "key" in row ? row.key : row.first;
    const value = "value" in row ? row.value : row.second;
    if (["uint64", "int64"].indexOf(value[0]) >= 0) {
      Object.defineProperty(result, key, { value: String(value[1]), enumerable: true, writable: true, configurable: true });
    } else if (["INT64_VEC", "UINT64_VEC"].indexOf(value[0]) >= 0) {
      Object.defineProperty(result, key, {
        value: value[1].map((entry) => String(entry)),
        enumerable: true,
        writable: true,
        configurable: true
      });
    } else if (["float32", "float64"].indexOf(value[0]) >= 0) {
      Object.defineProperty(result, key, {
        value: coerceFloatValue(value[1], value[0] === "float32"),
        enumerable: true,
        writable: true,
        configurable: true
      });
    } else if (["FLOAT_VEC", "DOUBLE_VEC"].indexOf(value[0]) >= 0) {
      Object.defineProperty(result, key, {
        value: value[1].map((entry) => coerceFloatValue(entry, value[0] === "FLOAT_VEC")),
        enumerable: true,
        writable: true,
        configurable: true
      });
    } else {
      Object.defineProperty(result, key, { value: value[1], enumerable: true, writable: true, configurable: true });
    }
  }
  return result;
}

// src/Actions/Explorer.ts
var ExplorerActionGenerator = class extends ActionGenerator {
  constructor(contract, api) {
    super(contract);
    this.api = api;
  }
  get config() {
    if (!this._config) {
      const pending = this.api.getConfig();
      pending.catch(() => {
        if (this._config === pending) {
          this._config = void 0;
        }
      });
      this._config = pending;
    }
    return this._config;
  }
  async createcol(authorization, author, collection_name, allow_notify, authorized_accounts, notify_accounts, market_fee, data) {
    return super.createcol(
      authorization,
      author,
      collection_name,
      allow_notify,
      authorized_accounts,
      notify_accounts,
      market_fee,
      toAttributeMap(data, (await this.config).collection_format)
    );
  }
  async createtempl(authorization, authorized_creator, collection_name, schema_name, transferable, burnable, max_supply, immutable_data) {
    const schema = await this.api.getSchema(collection_name, schema_name);
    const immutable_attribute_map = toAttributeMap(immutable_data, schema.format);
    return super.createtempl(
      authorization,
      authorized_creator,
      collection_name,
      schema_name,
      transferable,
      burnable,
      max_supply,
      immutable_attribute_map
    );
  }
  async mintasset(authorization, authorized_minter, collection_name, schema_name, template_id, new_owner, immutable_data, mutable_data, tokens_to_back) {
    const schema = await this.api.getSchema(collection_name, schema_name);
    const immutable_attribute_map = toAttributeMap(immutable_data, schema.format);
    const mutable_attribute_map = toAttributeMap(mutable_data, schema.format);
    return super.mintasset(
      authorization,
      authorized_minter,
      collection_name,
      schema_name,
      template_id,
      new_owner,
      immutable_attribute_map,
      mutable_attribute_map,
      tokens_to_back
    );
  }
  async setassetdata(authorization, authorized_editor, owner, asset_id, mutable_data) {
    const asset = await this.api.getAsset(asset_id);
    const mutable_attribute_map = toAttributeMap(mutable_data, asset.schema.format);
    return super.setassetdata(authorization, authorized_editor, owner, asset_id, mutable_attribute_map);
  }
  async setcoldata(authorization, collection_name, data) {
    const mdata = toAttributeMap(data, (await this.config).collection_format);
    return super.setcoldata(authorization, collection_name, mdata);
  }
};

// src/Actions/Rpc.ts
var RpcActionGenerator = class extends ActionGenerator {
  constructor(api) {
    super(api.contract);
    this.api = api;
  }
  async createcol(authorization, author, collection_name, allow_notify, authorized_accounts, notify_accounts, market_fee, data) {
    const config = await this.api.config();
    return super.createcol(
      authorization,
      author,
      collection_name,
      allow_notify,
      authorized_accounts,
      notify_accounts,
      market_fee,
      toAttributeMap(data, config.collection_format)
    );
  }
  async createtempl(authorization, authorized_creator, collection_name, schema_name, transferable, burnable, max_supply, immutable_data) {
    const schema = await this.api.getSchema(collection_name, schema_name);
    const immutable_attribute_map = toAttributeMap(immutable_data, await schema.rawFormat());
    return super.createtempl(
      authorization,
      authorized_creator,
      collection_name,
      schema_name,
      transferable,
      burnable,
      max_supply,
      immutable_attribute_map
    );
  }
  async mintasset(authorization, authorized_minter, collection_name, schema_name, template_id, new_owner, immutable_data, mutable_data, tokens_to_back) {
    const template = await this.api.getTemplate(collection_name, String(template_id));
    const immutable_attribute_map = toAttributeMap(immutable_data, await (await template.schema()).rawFormat());
    const mutable_attribute_map = toAttributeMap(mutable_data, await (await template.schema()).rawFormat());
    return super.mintasset(
      authorization,
      authorized_minter,
      collection_name,
      schema_name,
      template_id,
      new_owner,
      immutable_attribute_map,
      mutable_attribute_map,
      tokens_to_back
    );
  }
  async setassetdata(authorization, authorized_editor, owner, asset_id, mutable_data) {
    const asset = await this.api.getAsset(owner, asset_id);
    const schema = await asset.schema();
    const mutable_attribute_map = toAttributeMap(mutable_data, await schema.rawFormat());
    return super.setassetdata(authorization, authorized_editor, owner, asset_id, mutable_attribute_map);
  }
  async setcoldata(authorization, collection_name, data) {
    const mdata = toAttributeMap(data, (await this.api.config()).collection_format);
    return super.setcoldata(authorization, collection_name, mdata);
  }
};

// src/Errors/ApiError.ts
var ApiError = class extends Error {
  constructor(message, status) {
    super(message);
    this.message = message;
    this.status = status;
    this.isApiError = true;
  }
};

// src/API/Explorer/index.ts
function encodeSegment(value, field) {
  if (value === null || value === void 0) {
    throw new Error(`${field} is required`);
  }
  const segment = String(value);
  if (segment === "" || segment === "." || segment === "..") {
    throw new Error(
      `${field} ${JSON.stringify(segment)} is not a valid path segment: it is empty or a dot segment, so it would rewrite the request path`
    );
  }
  return encodeURIComponent(segment);
}
function buildDataOptions(options, data) {
  const dataFields = {};
  for (const row of data) {
    const dataType = row.type ?? "data";
    if (typeof row.value === "number") {
      dataFields[dataType + ":number." + row.key] = String(row.value);
    } else if (typeof row.value === "boolean") {
      dataFields[dataType + ":bool." + row.key] = row.value ? "true" : "false";
    } else {
      dataFields[dataType + "." + row.key] = row.value;
    }
  }
  return Object.assign({}, options, dataFields);
}
var ExplorerApi = class {
  constructor(endpoint, namespace, args) {
    this.endpoint = endpoint;
    this.namespace = namespace;
    if (args.fetch) {
      this.fetchBuiltin = args.fetch;
    } else {
      this.fetchBuiltin = globalThis.fetch.bind(globalThis);
    }
  }
  get action() {
    if (!this._action) {
      const pending = (async () => {
        return new ExplorerActionGenerator((await this.getConfig()).contract, this);
      })();
      pending.catch(() => {
        if (this._action === pending) {
          this._action = void 0;
        }
      });
      this._action = pending;
    }
    return this._action;
  }
  async getConfig() {
    return await this.fetchEndpoint("/v1/config", {});
  }
  async getAssets(options = {}, page = 1, limit = 100, data = []) {
    return await this.fetchEndpoint("/v1/assets", { page, limit, ...buildDataOptions(options, data) });
  }
  async countAssets(options, data = []) {
    return await this.countEndpoint("/v1/assets", buildDataOptions(options, data));
  }
  async getAsset(id) {
    return await this.fetchEndpoint("/v1/assets/" + encodeSegment(id, "asset id"), {});
  }
  async getAssetStats(id) {
    return await this.fetchEndpoint("/v1/assets/" + encodeSegment(id, "asset id") + "/stats", {});
  }
  async getAssetLogs(id, page = 1, limit = 100, order = "desc") {
    return await this.fetchEndpoint("/v1/assets/" + encodeSegment(id, "asset id") + "/logs", { page, limit, order });
  }
  async getCollections(options = {}, page = 1, limit = 100) {
    return await this.fetchEndpoint("/v1/collections", { page, limit, ...options });
  }
  async countCollections(options = {}) {
    return await this.countEndpoint("/v1/collections", options);
  }
  async getCollection(name) {
    return await this.fetchEndpoint("/v1/collections/" + encodeSegment(name, "collection name"), {});
  }
  async getCollectionStats(name) {
    return await this.fetchEndpoint("/v1/collections/" + encodeSegment(name, "collection name") + "/stats", {});
  }
  async getCollectionLogs(name, page = 1, limit = 100, order = "desc") {
    return await this.fetchEndpoint("/v1/collections/" + encodeSegment(name, "collection name") + "/logs", { page, limit, order });
  }
  async getSchemas(options = {}, page = 1, limit = 100) {
    return await this.fetchEndpoint("/v1/schemas", { page, limit, ...options });
  }
  async countSchemas(options = {}) {
    return await this.countEndpoint("/v1/schemas", options);
  }
  async getSchema(collection, name) {
    return await this.fetchEndpoint("/v1/schemas/" + encodeSegment(collection, "collection name") + "/" + encodeSegment(name, "schema name"), {});
  }
  async getSchemaStats(collection, name) {
    return await this.fetchEndpoint("/v1/schemas/" + encodeSegment(collection, "collection name") + "/" + encodeSegment(name, "schema name") + "/stats", {});
  }
  async getSchemaLogs(collection, name, page = 1, limit = 100, order = "desc") {
    return await this.fetchEndpoint("/v1/schemas/" + encodeSegment(collection, "collection name") + "/" + encodeSegment(name, "schema name") + "/logs", { page, limit, order });
  }
  async getTemplates(options = {}, page = 1, limit = 100, data = []) {
    return await this.fetchEndpoint("/v1/templates", { page, limit, ...buildDataOptions(options, data) });
  }
  async countTemplates(options = {}, data = []) {
    return await this.countEndpoint("/v1/templates", buildDataOptions(options, data));
  }
  async getTemplate(collection, id) {
    return await this.fetchEndpoint("/v1/templates/" + encodeSegment(collection, "collection name") + "/" + encodeSegment(id, "template id"), {});
  }
  async getTemplateStats(collection, id) {
    return await this.fetchEndpoint("/v1/templates/" + encodeSegment(collection, "collection name") + "/" + encodeSegment(id, "template id") + "/stats", {});
  }
  async getTemplateLogs(collection, id, page = 1, limit = 100, order = "desc") {
    return await this.fetchEndpoint("/v1/templates/" + encodeSegment(collection, "collection name") + "/" + encodeSegment(id, "template id") + "/logs", { page, limit, order });
  }
  async getTransfers(options = {}, page = 1, limit = 100) {
    return await this.fetchEndpoint("/v1/transfers", { page, limit, ...options });
  }
  async countTransfers(options = {}) {
    return await this.countEndpoint("/v1/transfers", options);
  }
  async getOffers(options = {}, page = 1, limit = 100) {
    return await this.fetchEndpoint("/v1/offers", { page, limit, ...options });
  }
  async countOffers(options = {}) {
    return await this.countEndpoint("/v1/offers", options);
  }
  async getOffer(id) {
    return await this.fetchEndpoint("/v1/offers/" + encodeSegment(id, "offer id"), {});
  }
  async getAccounts(options = {}, page = 1, limit = 100) {
    return await this.fetchEndpoint("/v1/accounts", { page, limit, ...options });
  }
  async getBurns(options = {}, page = 1, limit = 100) {
    return await this.fetchEndpoint("/v1/burns", { page, limit, ...options });
  }
  async countAccounts(options = {}) {
    return await this.countEndpoint("/v1/accounts", options);
  }
  async getAccount(account, options = {}) {
    return await this.fetchEndpoint("/v1/accounts/" + encodeSegment(account, "account"), options);
  }
  async getAccountCollection(account, collection) {
    return await this.fetchEndpoint("/v1/accounts/" + encodeSegment(account, "account") + "/" + encodeSegment(collection, "collection name"), {});
  }
  async getAccountBurns(account, options = {}) {
    return await this.fetchEndpoint("/v1/burns/" + encodeSegment(account, "account"), options);
  }
  // path is literals plus encodeSegment output; this method validates nothing.
  async fetchEndpoint(path, args) {
    let response, json;
    const f = this.fetchBuiltin;
    const queryString = Object.keys(args).map((key) => {
      let value = args[key];
      if (value === true) {
        value = "true";
      }
      if (value === false) {
        value = "false";
      }
      return encodeURIComponent(key) + "=" + encodeURIComponent(value);
    }).join("&");
    try {
      if (queryString.length < 1e3) {
        response = await f(this.endpoint + "/" + this.namespace + path + (queryString.length > 0 ? "?" + queryString : ""));
      } else {
        response = await f(
          this.endpoint + "/" + this.namespace + path,
          {
            headers: {
              "accept": "*.*",
              "content-type": "application/json"
            },
            method: "POST",
            body: JSON.stringify(args)
          }
        );
      }
      json = await response.json();
    } catch (e) {
      throw new ApiError(e.message, 500);
    }
    if (response.status !== 200) {
      throw new ApiError(json.message, response.status);
    }
    if (!json.success) {
      throw new ApiError(json.message, response.status);
    }
    return json.data;
  }
  async countEndpoint(path, args) {
    const res = await this.fetchEndpoint(path + "/_count", args);
    return parseInt(res, 10);
  }
};

// src/Errors/RpcError.ts
var RpcError = class extends Error {
  constructor(json) {
    if (json.error && json.error.details && json.error.details.length && json.error.details[0].message) {
      super(json.error.details[0].message);
    } else if (json.processed && json.processed.except && json.processed.except.message) {
      super(json.processed.except.message);
    } else {
      super(json.message);
    }
    this.json = json;
  }
};

// src/Errors/SchemaError.ts
var SchemaError = class extends Error {
};

// src/Errors/DeserializationError.ts
var DeserializationError = class extends Error {
};

// src/Serialization/Coders/Base.ts
var BaseCoder = class {
  constructor(ALPHABET) {
    this.ALPHABET = ALPHABET;
    if (ALPHABET.length >= 255) {
      throw new TypeError("Alphabet too long");
    }
    this.BASE_MAP = new Uint8Array(256);
    for (let j = 0; j < this.BASE_MAP.length; j++) {
      this.BASE_MAP[j] = 255;
    }
    for (let i = 0; i < ALPHABET.length; i++) {
      const x = ALPHABET.charAt(i);
      const xc = x.charCodeAt(0);
      if (this.BASE_MAP[xc] !== 255) {
        throw new TypeError(x + " is ambiguous");
      }
      this.BASE_MAP[xc] = i;
    }
    this.BASE = ALPHABET.length;
    this.LEADER = ALPHABET.charAt(0);
    this.FACTOR = Math.log(this.BASE) / Math.log(256);
    this.iFACTOR = Math.log(256) / Math.log(this.BASE);
  }
  encode(source) {
    if (source.length === 0) {
      return "";
    }
    let zeroes = 0;
    let length = 0;
    let pbegin = 0;
    const pend = source.length;
    while (pbegin !== pend && source[pbegin] === 0) {
      pbegin++;
      zeroes++;
    }
    const size = (pend - pbegin) * this.iFACTOR + 1 >>> 0;
    const b58 = new Uint8Array(size);
    while (pbegin !== pend) {
      let carry = source[pbegin];
      let i = 0;
      for (let it1 = size - 1; (carry !== 0 || i < length) && it1 !== -1; it1--, i++) {
        carry += 256 * b58[it1] >>> 0;
        b58[it1] = carry % this.BASE >>> 0;
        carry = carry / this.BASE >>> 0;
      }
      if (carry !== 0) {
        throw new Error("Non-zero carry");
      }
      length = i;
      pbegin++;
    }
    let it2 = size - length;
    while (it2 !== size && b58[it2] === 0) {
      it2++;
    }
    let str = this.LEADER.repeat(zeroes);
    for (; it2 < size; ++it2) {
      str += this.ALPHABET.charAt(b58[it2]);
    }
    return str;
  }
  decode(source) {
    const buffer = this.decodeUnsafe(source);
    if (buffer) {
      return buffer;
    }
    throw new Error("Non-base" + this.BASE + " character");
  }
  // Returns null on invalid input (mirroring upstream base-x's undefined) so
  // decode() can raise; the empty string legitimately decodes to zero bytes.
  decodeUnsafe(source) {
    if (source.length === 0) {
      return new Uint8Array(0);
    }
    let psz = 0;
    if (source[psz] === " ") {
      return null;
    }
    let zeroes = 0;
    let length = 0;
    while (source[psz] === this.LEADER) {
      zeroes++;
      psz++;
    }
    const size = (source.length - psz) * this.FACTOR + 1 >>> 0;
    const b256 = new Uint8Array(size);
    while (source[psz]) {
      let carry = this.BASE_MAP[source.charCodeAt(psz)];
      if (carry === 255) {
        return null;
      }
      let i = 0;
      for (let it3 = size - 1; (carry !== 0 || i < length) && it3 !== -1; it3--, i++) {
        carry += this.BASE * b256[it3] >>> 0;
        b256[it3] = carry % 256 >>> 0;
        carry = carry / 256 >>> 0;
      }
      if (carry !== 0) {
        throw new Error("Non-zero carry");
      }
      length = i;
      psz++;
    }
    if (source[psz] === " ") {
      return null;
    }
    let it4 = size - length;
    while (it4 !== size && b256[it4] === 0) {
      it4++;
    }
    const vch = new Uint8Array(zeroes + (size - it4));
    vch.fill(0, 0, zeroes);
    let j = zeroes;
    while (it4 !== size) {
      vch[j++] = b256[it4++];
    }
    return vch;
  }
};

// src/Serialization/Binary.ts
function varint_encode(input) {
  const bytes = [];
  let n = BigInt(input);
  if (n < 0n) {
    throw new SerializationError("cant pack negative integer");
  }
  while (true) {
    const byte = n & 0x7Fn;
    n = n >> 7n;
    if (n === 0n) {
      bytes.push(Number(byte));
      break;
    }
    bytes.push(Number(byte) + 128);
  }
  return new Uint8Array(bytes);
}
var VARINT_MAX_BYTES = 10;
function varint_decode(state) {
  let result = 0n;
  for (let i = 0; true; i++) {
    if (i >= VARINT_MAX_BYTES) {
      throw new DeserializationError("varint exceeds maximum encoded length");
    }
    if (state.position >= state.data.length) {
      throw new DeserializationError("failed to unpack integer");
    }
    const byte = BigInt(state.data[state.position]);
    state.position += 1;
    if (byte < 128n) {
      result = result + (byte << BigInt(7 * i));
      break;
    }
    result = result + ((byte & 0x7Fn) << BigInt(7 * i));
  }
  return result;
}
function zigzag_encode(input) {
  const n = BigInt(input);
  if (n < 0n) {
    return (n + 1n) * -2n + 1n;
  }
  return n * 2n;
}
function zigzag_decode(input) {
  const n = BigInt(input);
  if (n % 2n === 0n) {
    return n / 2n;
  }
  return n / 2n * -1n - 1n;
}
var bs58 = /* @__PURE__ */ new BaseCoder("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz");
function base58_decode(data) {
  return bs58.decode(data);
}
function base58_encode(data) {
  return bs58.encode(data);
}
function hex_decode(hex) {
  if (!/^([0-9a-fA-F]{2})*$/.test(hex)) {
    throw new DeserializationError("invalid hex string");
  }
  const bytes = hex.match(/.{2}/g);
  if (!bytes) {
    return new Uint8Array(0);
  }
  return new Uint8Array(bytes.map((byte) => parseInt(byte, 16)));
}
function concat_byte_arrays(arr) {
  const data = new Uint8Array(arr.reduce((acc, val) => acc + val.length, 0));
  let offset = 0;
  for (const bytes of arr) {
    data.set(bytes, offset);
    offset += bytes.length;
  }
  return data;
}

// src/Schema/MappingSchema.ts
var MappingSchema = class {
  constructor(attributes) {
    this.attributes = attributes;
    this.reserved = 4;
  }
  deserialize(state, upwardsCompatible = false) {
    const object = {};
    while (state.position < state.data.length) {
      const identifier = varint_decode(state);
      if (identifier === 0n) {
        break;
      }
      const attribute = this.getAttribute(Number(identifier), !upwardsCompatible);
      if (attribute) {
        Object.defineProperty(object, attribute.name, {
          value: attribute.value.deserialize(state),
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
    }
    return object;
  }
  serialize(object) {
    const data = [];
    for (let i = 0; i < this.attributes.length; i++) {
      const attribute = this.attributes[i];
      if (typeof object[attribute.name] === "undefined") {
        continue;
      }
      data.push(varint_encode(i + this.reserved));
      data.push(attribute.value.serialize(object[attribute.name]));
    }
    data.push(varint_encode(0));
    return concat_byte_arrays(data);
  }
  getAttribute(identifier, throwError = true) {
    const attributeID = identifier - this.reserved;
    if (attributeID >= this.attributes.length) {
      if (throwError) {
        throw new SchemaError("attribute does not exists");
      }
      return;
    }
    return this.attributes[Number(attributeID)];
  }
};

// src/Serialization/State.ts
var SerializationState = class {
  constructor(data, position = 0) {
    this.data = data;
    this.position = position;
  }
};

// src/Serialization/index.ts
function toByteArray(data) {
  if (typeof data === "string") {
    return hex_decode(data.startsWith("\\x") ? data.substring(2) : data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(data);
}
function serialize(object, schema) {
  const data = schema.serialize(object);
  if (schema instanceof MappingSchema) {
    return data.slice(0, data.length - 1);
  }
  return data;
}
function deserialize(data, schema) {
  let bytes = toByteArray(data);
  if (schema instanceof MappingSchema) {
    bytes = concat_byte_arrays([bytes, varint_encode(0)]);
  }
  const state = new SerializationState(bytes, 0);
  return schema.deserialize(state);
}

// src/Schema/ValueSchema.ts
var ValueSchema = class {
  constructor(type) {
    if (typeof ParserTypes[type] === "undefined") {
      throw new SchemaError(`attribute type '${type}' not defined`);
    }
    this.parser = ParserTypes[type];
  }
  deserialize(state) {
    return this.parser.deserialize(state);
  }
  serialize(value) {
    return this.parser.serialize(value);
  }
};

// src/Schema/VectorSchema.ts
var VectorSchema = class {
  constructor(element) {
    this.element = element;
  }
  deserialize(state) {
    const rawLength = varint_decode(state);
    if (rawLength > BigInt(state.data.length - state.position)) {
      throw new DeserializationError("VectorSchema: length exceeds remaining data");
    }
    const length = Number(rawLength);
    const array = [];
    for (let i = 0; i < length; i++) {
      array.push(this.element.deserialize(state));
    }
    return array;
  }
  serialize(array) {
    const data = [varint_encode(array.length)];
    for (const element of array) {
      data.push(this.element.serialize(element));
    }
    return concat_byte_arrays(data);
  }
};

// src/Schema/index.ts
function buildObjectSchema(objectID, lookup) {
  const attributes = [];
  let fields = lookup[objectID];
  if (typeof fields === "undefined") {
    fields = [];
  }
  delete lookup[objectID];
  for (const field of fields) {
    attributes.push({ name: field.name, value: buildValueSchema(field.type, lookup) });
  }
  return new MappingSchema(attributes);
}
function buildValueSchema(type, lookup) {
  if (type.endsWith("[]")) {
    return new VectorSchema(buildValueSchema(type.substring(0, type.length - 2), lookup));
  }
  if (type.startsWith("object{") && type.endsWith("}")) {
    const objectID = parseInt(type.substring(7, type.length - 1), 10);
    if (isNaN(objectID)) {
      throw new SchemaError(`invalid type '${type}'`);
    }
    return buildObjectSchema(objectID, lookup);
  }
  return new ValueSchema(type);
}
function ObjectSchema(schema) {
  const objectLookup = {};
  for (const schemaObject of schema) {
    const objectID = typeof schemaObject.parent === "undefined" ? 0 : schemaObject.parent;
    if (typeof objectLookup[objectID] === "undefined") {
      objectLookup[objectID] = [];
    }
    objectLookup[objectID].push(schemaObject);
  }
  return buildObjectSchema(0, objectLookup);
}
var objectSchemaCache = /* @__PURE__ */ new Map();
var OBJECT_SCHEMA_CACHE_MAX_ENTRIES = 500;
function CachedObjectSchema(schema) {
  const key = JSON.stringify(schema);
  let cached = objectSchemaCache.get(key);
  if (!cached) {
    cached = ObjectSchema(schema);
    if (objectSchemaCache.size >= OBJECT_SCHEMA_CACHE_MAX_ENTRIES) {
      const oldestKey = objectSchemaCache.keys().next().value;
      if (oldestKey !== void 0) {
        objectSchemaCache.delete(oldestKey);
      }
    }
    objectSchemaCache.set(key, cached);
  }
  return cached;
}

// src/API/Rpc/Collection.ts
var RpcCollection = class {
  constructor(api, name, data, cache = true) {
    this.api = api;
    this.name = name;
    this._data = new Promise(async (resolve, reject) => {
      if (data) {
        resolve(data);
      } else {
        try {
          resolve(await api.queue.fetchCollection(name, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
  }
  async author() {
    return (await this._data).author;
  }
  async allowNotify() {
    return (await this._data).allow_notify;
  }
  async authorizedAccounts() {
    return (await this._data).authorized_accounts;
  }
  async notifyAccounts() {
    return (await this._data).notify_accounts;
  }
  async marketFee() {
    return Number((await this._data).market_fee);
  }
  async data() {
    return deserialize((await this._data).serialized_data, ObjectSchema((await this.api.config()).collection_format));
  }
  async toObject() {
    return {
      collection_name: this.name,
      author: await this.author(),
      allowNotify: await this.allowNotify(),
      authorizedAccounts: await this.authorizedAccounts(),
      notifyAccounts: await this.notifyAccounts(),
      marketFee: await this.marketFee(),
      data: await this.data()
    };
  }
};

// src/API/Rpc/Schema.ts
var RpcSchema = class {
  constructor(api, collection, name, data, cache = true) {
    this.api = api;
    this._formatTypes = null;
    this.collection = collection;
    this.name = name;
    this._data = new Promise(async (resolve, reject) => {
      if (data) {
        resolve(data);
      } else {
        try {
          resolve(await api.queue.fetchSchema(collection, name, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
    this._collection = new Promise(async (resolve, reject) => {
      try {
        resolve(new RpcCollection(api, collection, void 0, cache));
      } catch (e) {
        reject(e);
      }
    });
  }
  async format() {
    return ObjectSchema((await this._data).format);
  }
  async rawFormat() {
    return (await this._data).format;
  }
  // v2 per-field media-type hints (schematypes table, set via setschematyp);
  // empty for schemas without a types row.
  async formatTypes() {
    if (!this._formatTypes) {
      this._formatTypes = this.api.queue.fetchSchemaFormatTypes(this.collection, this.name);
    }
    return await this._formatTypes;
  }
  async toObject() {
    return {
      collection_name: this.collection,
      schema_name: this.name,
      format: await this.rawFormat()
    };
  }
};

// src/API/Rpc/Template.ts
var RpcTemplate = class {
  constructor(api, collection, id, data, schema, cache = true) {
    this.api = api;
    this.collection = collection;
    this.id = id;
    this._data = new Promise(async (resolve, reject) => {
      if (data) {
        resolve(data);
      } else {
        try {
          resolve(await api.queue.fetchTemplate(collection, id, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
    this._schema = new Promise(async (resolve, reject) => {
      if (schema) {
        resolve(schema);
      } else {
        try {
          const row = await this._data;
          resolve(new RpcSchema(this.api, collection, row.schema_name, void 0, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
  }
  async schema() {
    return await this._schema;
  }
  async immutableData() {
    const schema = await this._schema;
    return deserialize((await this._data).immutable_serialized_data, await schema.format());
  }
  // v2 mutable template data (templates2 table, set via
  // createtempl2/settempldata); empty for templates without a mutable row.
  async mutableData() {
    const schema = await this._schema;
    return deserialize((await this._data).mutable_serialized_data, await schema.format());
  }
  // immutable_data wins over mutable_data on key collision: immutable
  // attributes are set at mint time and mutable data must not be able to
  // override them, so immutableData is applied last.
  async data() {
    return Object.assign({}, await this.mutableData(), await this.immutableData());
  }
  async isTransferable() {
    return (await this._data).transferable;
  }
  async isBurnable() {
    return (await this._data).burnable;
  }
  async maxSupply() {
    return (await this._data).max_supply;
  }
  async circulation() {
    return (await this._data).issued_supply;
  }
  async toObject() {
    return {
      collection_name: this.collection,
      template_id: this.id,
      schema: await (await this.schema()).toObject(),
      immutableData: await this.immutableData(),
      mutableData: await this.mutableData(),
      transferable: await this.isTransferable(),
      burnable: await this.isBurnable(),
      maxSupply: await this.maxSupply(),
      circulation: await this.circulation()
    };
  }
};

// src/API/Rpc/Asset.ts
var RpcAsset = class {
  constructor(api, owner, id, data, collection, schema, template, cache = true) {
    this.api = api;
    this.owner = owner;
    this.id = id;
    this._data = new Promise(async (resolve, reject) => {
      if (data) {
        resolve(data);
      } else {
        try {
          resolve(await api.queue.fetchAsset(owner, id, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
    this._template = new Promise(async (resolve, reject) => {
      if (template) {
        resolve(template);
      } else {
        try {
          const row = await this._data;
          if (Number(row.template_id) < 0) {
            return resolve(null);
          }
          resolve(new RpcTemplate(api, row.collection_name, row.template_id, void 0, void 0, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
    this._collection = new Promise(async (resolve, reject) => {
      if (collection) {
        resolve(collection);
      } else {
        try {
          const row = await this._data;
          resolve(new RpcCollection(api, row.collection_name, void 0, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
    this._schema = new Promise(async (resolve, reject) => {
      if (schema) {
        resolve(schema);
      } else {
        try {
          const row = await this._data;
          resolve(new RpcSchema(api, row.collection_name, row.schema_name, void 0, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
  }
  async template() {
    return await this._template;
  }
  async collection() {
    return await this._collection;
  }
  async schema() {
    return await this._schema;
  }
  async backedTokens() {
    return (await this._data).backed_tokens;
  }
  async immutableData() {
    const schema = await this.schema();
    const row = await this._data;
    return deserialize(row.immutable_serialized_data, await schema.format());
  }
  async mutableData() {
    const schema = await this.schema();
    const row = await this._data;
    return deserialize(row.mutable_serialized_data, await schema.format());
  }
  // template data overrides asset data on key collision: assets inherit
  // their attributes from the template and cannot override them, so
  // templateData is applied last (this is canonical AtomicAssets
  // semantics). Within templateData itself, immutable_data already won
  // over mutable_data (see Template#data).
  async data() {
    const mutableData = await this.mutableData();
    const immutableData = await this.immutableData();
    const template = await this.template();
    const templateData = template ? await template.data() : {};
    return Object.assign({}, mutableData, immutableData, templateData);
  }
  async toObject() {
    const template = await this.template();
    const collection = await this.collection();
    const schema = await this.schema();
    return {
      asset_id: this.id,
      collection: await collection.toObject(),
      schema: await schema.toObject(),
      template: template ? await template.toObject() : null,
      backedTokens: await this.backedTokens(),
      immutableData: await this.immutableData(),
      mutableData: await this.mutableData(),
      data: await this.data()
    };
  }
};

// src/API/Rpc/BaseCache.ts
var MemoryCache = class {
  constructor() {
    this.store = {};
  }
  get(key) {
    const res = this.store[key];
    if (typeof res === "undefined") {
      return null;
    }
    const [value, expires] = res;
    if (/* @__PURE__ */ new Date() > expires) {
      delete this.store[key];
      return null;
    }
    return value;
  }
  put(key, value, timeout) {
    const expires = new Date(Date.now() + timeout);
    this.store[key] = [value, expires];
  }
  remove(key) {
    delete this.store[key];
  }
};

// src/API/Rpc/RpcCache.ts
var RpcCache = class {
  constructor() {
    this.cache = new MemoryCache();
  }
  getAsset(assetID, data) {
    if (data) {
      data.mutable_serialized_data = new Uint8Array(data.mutable_serialized_data);
      data.immutable_serialized_data = new Uint8Array(data.immutable_serialized_data);
    }
    return this.access("assets", assetID, data);
  }
  deleteAsset(assetID) {
    this.delete("assets", assetID);
  }
  getTemplate(collectionName, templateID, data) {
    if (data) {
      data.immutable_serialized_data = new Uint8Array(data.immutable_serialized_data);
      data.mutable_serialized_data = new Uint8Array(data.mutable_serialized_data ?? []);
    }
    return this.access("templates", collectionName + ":" + templateID, data);
  }
  deleteTemplate(collectionName, templateID) {
    this.delete("templates", collectionName + ":" + templateID);
  }
  getSchema(collectionName, schemaName, data) {
    return this.access("schemas", collectionName + ":" + schemaName, data);
  }
  deleteSchema(collectionName, schemaName) {
    this.delete("schemas", collectionName + ":" + schemaName);
  }
  getCollection(collectionName, data) {
    return this.access("collections", collectionName, data);
  }
  deleteCollection(collectionName) {
    this.delete("collections", collectionName);
  }
  getOffer(offerID, data) {
    return this.access("offers", offerID, data);
  }
  deleteOffer(offerID) {
    this.delete("offers", offerID);
  }
  access(namespace, identifier, data) {
    if (typeof data === "undefined") {
      const cache = this.cache.get(namespace + ":" + identifier);
      return cache === null ? null : cache;
    }
    this.cache.put(namespace + ":" + identifier, data, 15 * 60 * 1e3);
    return data;
  }
  delete(namespace, identifier) {
    this.cache.remove(namespace + ":" + identifier);
  }
};

// src/API/Rpc/Offer.ts
var RpcOffer = class {
  constructor(api, id, data, senderAssets, receiverAssets, cache = true) {
    this.api = api;
    this.id = id;
    this._data = new Promise(async (resolve, reject) => {
      if (data) {
        resolve(data);
      } else {
        try {
          resolve(await this.api.queue.fetchOffer(id, cache));
        } catch (e) {
          reject(e);
        }
      }
    });
    this._senderAssets = new Promise(async (resolve, reject) => {
      if (senderAssets) {
        resolve(senderAssets);
      } else {
        try {
          const row = await this._data;
          const inventory = await this.api.queue.fetchAccountAssets(row.sender);
          return resolve(row.sender_asset_ids.map((assetID) => {
            const asset = inventory.find((assetRow) => assetRow.asset_id === assetID);
            return asset ? new RpcAsset(this.api, row.sender, assetID, asset, void 0, void 0, void 0, cache) : assetID;
          }));
        } catch (e) {
          return reject(e);
        }
      }
    });
    this._recipientAssets = new Promise(async (resolve, reject) => {
      if (receiverAssets) {
        resolve(receiverAssets);
      } else {
        try {
          const row = await this._data;
          const inventory = await this.api.queue.fetchAccountAssets(row.recipient);
          return resolve(row.recipient_asset_ids.map((assetID) => {
            const asset = inventory.find((assetRow) => assetRow.asset_id === assetID);
            return asset ? new RpcAsset(this.api, row.recipient, assetID, asset, void 0, void 0, void 0, cache) : assetID;
          }));
        } catch (e) {
          return reject(e);
        }
      }
    });
  }
  async sender() {
    return (await this._data).sender;
  }
  async recipient() {
    return (await this._data).recipient;
  }
  async senderAssets() {
    return await this._senderAssets;
  }
  async recipientAssets() {
    return await this._recipientAssets;
  }
  async memo() {
    return (await this._data).memo;
  }
  async toObject() {
    return {
      offer_id: this.id,
      sender: {
        account: await this.sender(),
        assets: await Promise.all((await this.senderAssets()).map(async (asset) => typeof asset === "string" ? asset : await asset.toObject()))
      },
      recipient: {
        account: await this.recipient(),
        assets: await Promise.all((await this.recipientAssets()).map(async (asset) => typeof asset === "string" ? asset : await asset.toObject()))
      },
      memo: await this.memo()
    };
  }
};

// src/API/Rpc/Queue.ts
var RpcQueue = class {
  constructor(api, requestLimit = 4) {
    this.api = api;
    this.requestLimit = requestLimit;
    this.elements = [];
    this.interval = null;
    this.preloadedCollections = {};
  }
  async fetchAsset(owner, assetID, useCache = true) {
    return await this.fetch_single_row("assets", owner, assetID, (data) => {
      return useCache || typeof data !== "undefined" ? this.api.cache.getAsset(assetID, data) : null;
    });
  }
  async fetchAccountAssets(account) {
    const rows = await this.fetch_all_rows("assets", account, "asset_id");
    return rows.map((asset) => {
      return this.api.cache.getAsset(asset.asset_id, asset);
    });
  }
  async fetchTemplate(collectionName, templateID, useCache = true) {
    const cached = useCache ? this.api.cache.getTemplate(collectionName, templateID) : null;
    if (cached) {
      return cached;
    }
    const [row, mutableRow] = await Promise.all([
      this.fetch_optional_row("templates", collectionName, templateID),
      this.fetch_optional_row("templates2", collectionName, templateID)
    ]);
    if (!row) {
      throw new Error("Row not found for template " + collectionName + ":" + templateID);
    }
    row.mutable_serialized_data = mutableRow ? mutableRow.mutable_serialized_data : [];
    return this.api.cache.getTemplate(collectionName, templateID, row);
  }
  async fetchSchemaFormatTypes(collectionName, schemaName) {
    const row = await this.fetch_optional_row(
      "schematypes",
      collectionName,
      schemaName
    );
    return row ? row.format_type : [];
  }
  async fetchSchema(collectionName, schemaName, useCache = true) {
    return await this.fetch_single_row("schemas", collectionName, schemaName, (data) => {
      return useCache || typeof data !== "undefined" ? this.api.cache.getSchema(collectionName, schemaName, data) : null;
    });
  }
  async fetchCollection(collectionName, useCache = true) {
    return await this.fetch_single_row("collections", this.api.contract, collectionName, (data) => {
      return useCache || typeof data !== "undefined" ? this.api.cache.getCollection(collectionName, data) : null;
    });
  }
  async fetchCollectionSchemas(collectionName) {
    const rows = await this.fetch_all_rows("schemas", collectionName, "schema_name");
    return rows.map((schema) => {
      return this.api.cache.getSchema(collectionName, schema.schema_name, schema);
    });
  }
  async fetchCollectionTemplates(collectionName) {
    const [rows, mutableRows] = await Promise.all([
      this.fetch_all_rows("templates", collectionName, "template_id"),
      this.fetch_all_rows("templates2", collectionName, "template_id")
    ]);
    const mutableData = new Map(mutableRows.map((row) => [String(row.template_id), row.mutable_serialized_data]));
    return rows.map((template) => {
      template.mutable_serialized_data = mutableData.get(String(template.template_id)) ?? [];
      return this.api.cache.getTemplate(collectionName, String(template.template_id), template);
    });
  }
  async preloadCollection(collectionName, useCache = true) {
    if (!useCache || !this.preloadedCollections[collectionName] || this.preloadedCollections[collectionName] + 15 * 60 * 1e3 < Date.now()) {
      await this.fetchCollectionSchemas(collectionName);
      await this.fetchCollectionTemplates(collectionName);
    }
  }
  async fetchOffer(offerID, useCache = true) {
    return await this.fetch_single_row("offers", this.api.contract, offerID, (data) => {
      return useCache || typeof data !== "undefined" ? this.api.cache.getOffer(offerID, data) : null;
    });
  }
  async fetchAccountOffers(account) {
    const rows = await Promise.all([
      this.fetch_all_rows(
        "offers",
        this.api.contract,
        "offer_sender",
        account,
        account,
        2,
        "name"
      ),
      this.fetch_all_rows(
        "offers",
        this.api.contract,
        "offer_recipient",
        account,
        account,
        3,
        "name"
      )
    ]);
    const offers = rows[0].concat(rows[1]);
    return offers.map((offer) => {
      return this.api.cache.getOffer(offer.offer_id, offer);
    });
  }
  dequeue() {
    if (this.interval) {
      return;
    }
    this.interval = setInterval(async () => {
      if (this.elements.length > 0) {
        this.elements.shift()();
      } else {
        clearInterval(this.interval);
        this.interval = null;
      }
    }, Math.ceil(1e3 / this.requestLimit));
  }
  // Like fetch_single_row but resolves null for a missing row instead of
  // rejecting; used for the v2 side tables (templates2, schematypes) whose
  // rows only exist once the corresponding v2 action has run.
  async fetch_optional_row(table, scope, match, indexPosition = 1, keyType = "") {
    return new Promise((resolve, reject) => {
      this.elements.push(async () => {
        try {
          const resp = await this.api.getTableRows({
            code: this.api.contract,
            table,
            scope,
            limit: 1,
            lower_bound: match,
            upper_bound: match,
            index_position: indexPosition,
            key_type: keyType
          });
          return resolve(resp.rows.length === 0 ? null : resp.rows[0]);
        } catch (e) {
          return reject(e);
        }
      });
      this.dequeue();
    });
  }
  async fetch_single_row(table, scope, match, cacheFn, indexPosition = 1, keyType = "") {
    return new Promise((resolve, reject) => {
      let data = cacheFn();
      if (data !== null) {
        return resolve(data);
      }
      this.elements.push(async () => {
        data = cacheFn();
        if (data !== null) {
          return resolve(data);
        }
        try {
          const options = {
            code: this.api.contract,
            table,
            scope,
            limit: 1,
            lower_bound: match,
            upper_bound: match,
            index_position: indexPosition,
            key_type: keyType
          };
          const resp = await this.api.getTableRows(options);
          if (resp.rows.length === 0) {
            return reject(new Error("Row not found for " + JSON.stringify(options)));
          }
          return resolve(cacheFn(resp.rows[0]));
        } catch (e) {
          return reject(e);
        }
      });
      this.dequeue();
    });
  }
  async fetch_all_rows(table, scope, tableKey, lowerBound = "", upperBound = "", indexPosition = 1, keyType = "") {
    return new Promise(async (resolve, reject) => {
      this.elements.push(async () => {
        const resp = await this.api.getTableRows({
          code: this.api.contract,
          scope,
          table,
          lower_bound: lowerBound,
          upper_bound: upperBound,
          limit: 1e3,
          index_position: indexPosition,
          key_type: keyType
        });
        if (resp.more && indexPosition === 1) {
          this.elements.unshift(async () => {
            try {
              const next = await this.fetch_all_rows(
                table,
                scope,
                tableKey,
                resp.rows[resp.rows.length - 1][tableKey],
                upperBound,
                indexPosition,
                keyType
              );
              if (next.length > 0) {
                next.shift();
              }
              resolve(resp.rows.concat(next));
            } catch (e) {
              reject(e);
            }
          });
          this.dequeue();
        } else {
          resolve(resp.rows);
        }
      });
      this.dequeue();
    });
  }
};

// src/API/Rpc/index.ts
var RpcApi = class {
  constructor(endpoint, contract, args = { rateLimit: 4 }) {
    this.endpoint = endpoint;
    this.contract = contract;
    if (args.fetch) {
      this.fetchBuiltin = args.fetch;
    } else {
      this.fetchBuiltin = globalThis.fetch.bind(globalThis);
    }
    this.queue = new RpcQueue(this, args.rateLimit);
    this.cache = new RpcCache();
    this.action = new RpcActionGenerator(this);
  }
  get configPromise() {
    if (!this._config) {
      const pending = (async () => {
        const resp = await this.getTableRows({
          code: this.contract,
          scope: this.contract,
          table: "config"
        });
        if (resp.rows.length !== 1) {
          return Promise.reject("invalid config");
        }
        return resp.rows[0];
      })();
      pending.catch(() => {
        if (this._config === pending) {
          this._config = void 0;
        }
      });
      this._config = pending;
    }
    return this._config;
  }
  async config() {
    return await this.configPromise;
  }
  async getAsset(owner, id, cache = true) {
    if (!cache) {
      this.cache.deleteAsset(id);
    }
    const data = await this.queue.fetchAsset(owner, id, cache);
    return new RpcAsset(this, owner, id, data, void 0, void 0, void 0, cache);
  }
  async getTemplate(collectionName, templateID, cache = true) {
    if (!cache) {
      this.cache.deleteTemplate(collectionName, templateID);
    }
    const data = await this.queue.fetchTemplate(collectionName, templateID, cache);
    return new RpcTemplate(this, collectionName, templateID, data, void 0, cache);
  }
  async getCollection(collectionName, cache = true) {
    if (!cache) {
      this.cache.deleteCollection(collectionName);
    }
    const data = await this.queue.fetchCollection(collectionName, cache);
    return new RpcCollection(this, collectionName, data, cache);
  }
  async getCollectionTemplates(collectionName) {
    return (await this.queue.fetchCollectionTemplates(collectionName)).map((templateRow) => {
      return new RpcTemplate(this, collectionName, String(templateRow.template_id), templateRow, void 0);
    });
  }
  async getCollectionsSchemas(collectionName) {
    return (await this.queue.fetchCollectionSchemas(collectionName)).map((schemaRow) => {
      return new RpcSchema(this, collectionName, schemaRow.schema_name, void 0);
    });
  }
  async getSchema(collectionName, schemaName, cache = true) {
    if (!cache) {
      this.cache.deleteSchema(collectionName, schemaName);
    }
    const data = await this.queue.fetchSchema(collectionName, schemaName, cache);
    return new RpcSchema(this, collectionName, schemaName, data, cache);
  }
  async getOffer(offerID, cache = true) {
    if (!cache) {
      this.cache.deleteOffer(offerID);
    }
    const data = await this.queue.fetchOffer(offerID, cache);
    return new RpcOffer(this, offerID, data, void 0, void 0, cache);
  }
  async getAccountOffers(account) {
    return (await this.queue.fetchAccountOffers(account)).map((offerRow) => {
      return new RpcOffer(this, offerRow.offer_id, offerRow, void 0, void 0);
    });
  }
  async getAccountAssets(account) {
    return (await this.queue.fetchAccountAssets(account)).map((assetRow) => {
      return new RpcAsset(this, account, assetRow.asset_id, assetRow, void 0, void 0, void 0);
    });
  }
  async getCollectionInventory(collectionName, account) {
    await this.queue.preloadCollection(collectionName, true);
    return (await this.queue.fetchAccountAssets(account)).filter((assetRow) => assetRow.collection_name === collectionName).map((assetRow) => {
      return new RpcAsset(this, account, assetRow.asset_id, assetRow, void 0, void 0, void 0);
    });
  }
  async preloadCollection(collectionName, cache = true) {
    await this.queue.preloadCollection(collectionName, cache);
  }
  async getTableRows({
    code,
    scope,
    table,
    table_key = "",
    lower_bound = "",
    upper_bound = "",
    index_position = 1,
    key_type = ""
  }) {
    return await this.fetchRpc("/v1/chain/get_table_rows", {
      code,
      scope,
      table,
      table_key,
      lower_bound,
      upper_bound,
      index_position,
      key_type,
      limit: 101,
      reverse: false,
      show_payer: false,
      json: true
    });
  }
  async fetchRpc(path, body) {
    let response;
    let json;
    try {
      const f = this.fetchBuiltin;
      response = await f(this.endpoint + path, {
        body: JSON.stringify(body),
        method: "POST"
      });
      json = await response.json();
    } catch (e) {
      e.isFetchError = true;
      throw e;
    }
    if (json.processed && json.processed.except || !response.ok) {
      throw new RpcError(json);
    }
    return json;
  }
};

// src/Serialization/TypeParser/FixedParser.ts
var FixedParser = class {
  constructor(size) {
    this.size = size;
  }
  deserialize(state) {
    state.position += this.size;
    const data = state.data.slice(state.position - this.size, state.position);
    if (data.length !== this.size) {
      throw new DeserializationError("FixedParser: read past end");
    }
    return data;
  }
  serialize(data) {
    if (data.length !== this.size) {
      throw new SerializationError(`input data does not conform fixed size`);
    }
    return data;
  }
};

// src/Serialization/TypeParser/BooleanParser.ts
var BooleanParser = class extends FixedParser {
  constructor() {
    super(1);
  }
  deserialize(state) {
    const data = super.deserialize(state);
    return data[0] === 1 ? 1 : 0;
  }
  serialize(data) {
    return super.serialize(new Uint8Array([data ? 1 : 0]));
  }
};

// src/Serialization/TypeParser/VariableParser.ts
var VariableParser = class {
  deserialize(state) {
    const rawLength = varint_decode(state);
    if (rawLength > BigInt(state.data.length - state.position)) {
      throw new DeserializationError(`VariableParser: read past end`);
    }
    const length = Number(rawLength);
    state.position += length;
    const data = state.data.slice(state.position - length, state.position);
    if (data.length !== length) {
      throw new DeserializationError(`VariableParser: read past end`);
    }
    return data;
  }
  serialize(data) {
    return concat_byte_arrays([varint_encode(data.length), data]);
  }
};

// src/Serialization/TypeParser/ByteParser.ts
var ByteParser = class extends VariableParser {
  deserialize(state) {
    return super.deserialize(state);
  }
  serialize(data) {
    return super.serialize(data);
  }
};

// src/Serialization/TypeParser/FixedIntegerParser.ts
var FixedIntegerParser = class extends FixedParser {
  deserialize(state) {
    const data = super.deserialize(state).reverse();
    let n = 0n;
    for (const byte of data) {
      n = n << 8n;
      n = n + BigInt(byte);
    }
    if (this.size <= 6) {
      return Number(n);
    }
    return n.toString();
  }
  serialize(data) {
    let n = BigInt(data);
    const buffer = [];
    for (let i = 0; i < this.size; i++) {
      buffer.push(Number(n & 0xFFn));
      n = n >> 8n;
    }
    return super.serialize(new Uint8Array(buffer));
  }
};

// src/Serialization/TypeParser/FloatingParser.ts
var fp = null;
function floatHelper() {
  if (fp === null) {
    fp = require_float();
  }
  return fp;
}
var FloatingParser = class extends FixedParser {
  constructor(isDouble) {
    super(isDouble ? 8 : 4);
    this.isDouble = isDouble;
  }
  deserialize(state) {
    if (this.isDouble) {
      return floatHelper().readDoubleLE(super.deserialize(state));
    }
    return floatHelper().readFloatLE(super.deserialize(state));
  }
  serialize(data) {
    let bytes = [];
    if (this.isDouble) {
      floatHelper().writeDoubleLE(bytes, data);
      return super.serialize(new Uint8Array(bytes));
    }
    floatHelper().writeFloatLE(bytes, data);
    return super.serialize(new Uint8Array(bytes));
  }
};

// src/Serialization/TypeParser/IPFSParser.ts
var IPFSParser = class extends VariableParser {
  deserialize(state) {
    return base58_encode(super.deserialize(state));
  }
  serialize(data) {
    return super.serialize(base58_decode(data));
  }
};

// src/Serialization/TypeParser/StringParser.ts
var StringParser = class extends VariableParser {
  deserialize(state) {
    return new TextDecoder().decode(super.deserialize(state));
  }
  serialize(data) {
    return super.serialize(new TextEncoder().encode(data));
  }
};

// src/Serialization/TypeParser/VariableIntegerParser.ts
var VariableIntegerParser = class {
  constructor(size, unsigned) {
    this.size = size;
    this.unsigned = unsigned;
  }
  deserialize(state) {
    let n = varint_decode(state);
    if (!this.unsigned) {
      n = zigzag_decode(n);
    }
    if (n >= 2n ** BigInt(this.size * 8 - (this.unsigned ? 0 : 1))) {
      throw new DeserializationError("number '" + n.toString() + "' too large for given type");
    }
    if (!this.unsigned && n < -(2n ** BigInt(this.size * 8 - 1))) {
      throw new DeserializationError("number '" + n.toString() + "' too small for given type");
    }
    if (this.size <= 6) {
      return Number(n);
    }
    return n.toString();
  }
  serialize(data) {
    let n = BigInt(data);
    if (n >= 2n ** BigInt(this.size * 8 - (this.unsigned ? 0 : 1))) {
      throw new SerializationError("number '" + n.toString() + "' too large for given type");
    }
    if (!this.unsigned && n < -(2n ** BigInt(this.size * 8 - 1))) {
      throw new SerializationError("number '" + n.toString() + "' too small for given type");
    }
    if (!this.unsigned) {
      n = zigzag_encode(n);
    }
    return varint_encode(n);
  }
};

// src/Serialization/Types.ts
var ParserTypes = {
  int8: /* @__PURE__ */ new VariableIntegerParser(1, false),
  int16: /* @__PURE__ */ new VariableIntegerParser(2, false),
  int32: /* @__PURE__ */ new VariableIntegerParser(4, false),
  int64: /* @__PURE__ */ new VariableIntegerParser(8, false),
  uint8: /* @__PURE__ */ new VariableIntegerParser(1, true),
  uint16: /* @__PURE__ */ new VariableIntegerParser(2, true),
  uint32: /* @__PURE__ */ new VariableIntegerParser(4, true),
  uint64: /* @__PURE__ */ new VariableIntegerParser(8, true),
  fixed8: /* @__PURE__ */ new FixedIntegerParser(1),
  fixed16: /* @__PURE__ */ new FixedIntegerParser(2),
  fixed32: /* @__PURE__ */ new FixedIntegerParser(4),
  fixed64: /* @__PURE__ */ new FixedIntegerParser(8),
  bool: /* @__PURE__ */ new BooleanParser(),
  bytes: /* @__PURE__ */ new ByteParser(),
  string: /* @__PURE__ */ new StringParser(),
  image: /* @__PURE__ */ new StringParser(),
  ipfs: /* @__PURE__ */ new IPFSParser(),
  float: /* @__PURE__ */ new FloatingParser(false),
  double: /* @__PURE__ */ new FloatingParser(true)
};

// src/Networks.ts
var NETWORK_ENDPOINTS = {
  "wax": {
    api: "https://wax.api.atomicassets.io",
    rpc: "https://wax.api.atomicassets.io"
  },
  "wax-testnet": {
    api: "https://test.wax.api.atomicassets.io",
    rpc: "https://test.wax.api.atomicassets.io"
  },
  "vaulta": {
    api: "https://vaulta.api.atomicassets.io",
    rpc: "https://vaulta.api.atomicassets.io"
  },
  "xpr": {
    api: "https://xpr.api.atomicassets.io",
    rpc: "https://xpr.api.atomicassets.io"
  },
  "xpr-testnet": {
    api: "https://test.xpr.api.atomicassets.io",
    rpc: "https://test.xpr.api.atomicassets.io"
  },
  "jungle4": {
    api: "https://jungle4.api.atomicassets.io",
    rpc: "https://jungle4.api.atomicassets.io"
  }
};
function explorerApiForNetwork(network, options) {
  return new ExplorerApi(NETWORK_ENDPOINTS[network].api, "atomicassets", options ?? {});
}
function rpcApiForNetwork(network, contract = "atomicassets", options) {
  return new RpcApi(NETWORK_ENDPOINTS[network].rpc, contract, options);
}

// src/Errors/ExplorerError.ts
var RpcError2 = class extends Error {
};

// src/API/Explorer/Enums.ts
var OfferState = /* @__PURE__ */ ((OfferState2) => {
  OfferState2[OfferState2["Pending"] = 0] = "Pending";
  OfferState2[OfferState2["Invalid"] = 1] = "Invalid";
  OfferState2[OfferState2["Unknown"] = 2] = "Unknown";
  OfferState2[OfferState2["Accepted"] = 3] = "Accepted";
  OfferState2[OfferState2["Declined"] = 4] = "Declined";
  OfferState2[OfferState2["Canceled"] = 5] = "Canceled";
  return OfferState2;
})(OfferState || {});
var OrderParam = /* @__PURE__ */ ((OrderParam2) => {
  OrderParam2["Asc"] = "asc";
  OrderParam2["Desc"] = "desc";
  return OrderParam2;
})(OrderParam || {});
var AssetsSort = /* @__PURE__ */ ((AssetsSort2) => {
  AssetsSort2["AssetId"] = "asset_id";
  AssetsSort2["Updated"] = "updated";
  AssetsSort2["Transferred"] = "transferred";
  AssetsSort2["Minted"] = "minted";
  AssetsSort2["TemplateMint"] = "template_mint";
  AssetsSort2["Name"] = "name";
  return AssetsSort2;
})(AssetsSort || {});
var CollectionsSort = /* @__PURE__ */ ((CollectionsSort2) => {
  CollectionsSort2["Created"] = "created";
  CollectionsSort2["CollectionName"] = "collection_name";
  return CollectionsSort2;
})(CollectionsSort || {});
var OffersSort = /* @__PURE__ */ ((OffersSort2) => {
  OffersSort2["Created"] = "created";
  OffersSort2["Updated"] = "updated";
  return OffersSort2;
})(OffersSort || {});
var SchemasSort = /* @__PURE__ */ ((SchemasSort2) => {
  SchemasSort2["Created"] = "created";
  SchemasSort2["SchemaName"] = "schema_name";
  return SchemasSort2;
})(SchemasSort || {});
var TemplatesSort = /* @__PURE__ */ ((TemplatesSort2) => {
  TemplatesSort2["Created"] = "created";
  TemplatesSort2["Name"] = "name";
  return TemplatesSort2;
})(TemplatesSort || {});
var TransfersSort = /* @__PURE__ */ ((TransfersSort2) => {
  TransfersSort2["Created"] = "created";
  return TransfersSort2;
})(TransfersSort || {});

// src/Contracts/ActionNames.ts
var AtomicAssetsActionNames = [
  "acceptauswap",
  "acceptoffer",
  "addcolauth",
  "addconftoken",
  "addnotifyacc",
  "admincoledit",
  "announcedepo",
  "backasset",
  "burnasset",
  "canceloffer",
  "createauswap",
  "createcol",
  "createoffer",
  "createschema",
  "createtempl",
  "createtempl2",
  "declineoffer",
  "deltemplate",
  "extendschema",
  "forbidnotify",
  "init",
  "locktemplate",
  "logbackasset",
  "logburnasset",
  "logmint",
  "lognewoffer",
  "lognewtempl",
  "logrampayer",
  "logsetdata",
  "logsetdatatl",
  "logtransfer",
  "mintasset",
  "payofferram",
  "redtemplmax",
  "rejectauswap",
  "remcolauth",
  "remnotifyacc",
  "setassetdata",
  "setcoldata",
  "setlastpayer",
  "setmarketfee",
  "setrampayer",
  "setschematyp",
  "settempldata",
  "setversion",
  "transfer",
  "withdraw"
];
var AtomicAssetsActions = /* @__PURE__ */ Object.fromEntries(
  /* @__PURE__ */ AtomicAssetsActionNames.map((name) => [name, name])
);

// src/Contracts/SchemaFormat.ts
function mergeSchemaFormatTypes(format, types) {
  return format.map((field) => {
    const type = types.find((x) => x.name === field.name);
    const checkName = (match) => field.name.toLowerCase().startsWith(match) || field.name.toLowerCase().endsWith(match);
    let derivedType = null;
    if (field.name === "name") {
      derivedType = "name";
    }
    if (checkName("image") || checkName("img") || field.type === "image") {
      derivedType = "image";
    }
    if (checkName("video")) {
      derivedType = "video";
    }
    if (checkName("audio")) {
      derivedType = "audio";
    }
    return {
      ...field,
      mediatype: type?.mediatype || derivedType,
      info: type?.info || null
    };
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ATOMIC_ATTRIBUTE,
  ActionBuilder,
  ActionGenerator,
  ApiError,
  AssetsSort,
  AtomicAssetsActionNames,
  AtomicAssetsActions,
  CachedObjectSchema,
  CollectionsSort,
  DeserializationError,
  ExplorerActionGenerator,
  ExplorerApi,
  ExplorerError,
  NETWORK_ENDPOINTS,
  ObjectSchema,
  OfferState,
  OffersSort,
  OrderParam,
  ParserTypes,
  RpcActionGenerator,
  RpcApi,
  RpcError,
  SchemaError,
  SchemasSort,
  SerializationError,
  TemplatesSort,
  TransfersSort,
  convertAttributeMapToObject,
  createAttributeMap,
  deserialize,
  explorerApiForNetwork,
  mergeSchemaFormatTypes,
  rpcApiForNetwork,
  serialize,
  toAttributeMap,
  toByteArray
});
//# sourceMappingURL=index.cjs.map