/** Original processor hooks; partial coverage never claims full effects. */
export const ATOMIC_HOOK_INVENTORY = {
  "baseline": {
    "tag": "2.7.0",
    "commit": "0aabc47dcf8bd0804d4dcecb336c90fc02a9c89e"
  },
  "scope": "All 99 contract/action registrations and four lifecycle registrations in the 34 original AtomicAssets/AtomicMarket processor files at the pinned commit. Partial describes only existing restricted domain state; history, notifications and other effects remain unimplemented.",
  "sources": [
    {
      "path": "src/filler/handlers/atomicassets/processors/assets.integration.test.ts",
      "sha256": "ef4de24c08861074b118c8529db8037673f47d6aafbdd5f6c8f871c67ed673a0"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/assets.ts",
      "sha256": "d1897e903b5bac3ee9dc379925b1efded412e7cb7bd381aaae61558143bc5c9f"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/balances.ts",
      "sha256": "4fedff7d17e484583abea024bd36041c7569006250fc583f64230b94b16b54e9"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/collections.integration.test.ts",
      "sha256": "20b2acf6d9a1c995f60ceac119bee8d068ae7f01c925068342dc5be709ad259a"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/collections.ts",
      "sha256": "55637545d54b155f012bb3fb182070a40db83484d8a9a5a034edcfe084b2881d"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/config.integration.test.ts",
      "sha256": "e8c5d3b29177540c3a079a9f24973ebcb851f4f4ab5488b9c9463c8dc91ec7bd"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/config.ts",
      "sha256": "a1d1f9f13bce6d16fc1e53cb2906461cf6cadf40d1ede5b7cfac1de85f3ad37d"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/logs.integration.test.ts",
      "sha256": "f354fecc0ded5c851dccbeac2f2163bf39d93c88b60e4709662fbd48f5f2b08f"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/logs.ts",
      "sha256": "1a368a9fe98f9e552256e50788c7d9779ed404deed6b44b076dfc1bc4a5ea3dc"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/offers.integration.test.ts",
      "sha256": "3a65d636de6c8a5bf58aa24f7c49dbc5b7df79ed781a473c1b998b782d7420f9"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/offers.ts",
      "sha256": "0977c8ac44778c4fde0ac2ef574fa41b09190f42892daad916f1aeaab4329836"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/schemas.integration.test.ts",
      "sha256": "645240d518c94d3ff6594313727fc274b0dd1e8da81ffe95fe4e6d2df9fdaacd"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/schemas.ts",
      "sha256": "c29562be9e90fd0d3e946b01810c014ea00cd0f09c152aa79a3f262b44511ee7"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/templates.integration.test.ts",
      "sha256": "027d55650be464661f146fec98456e29feff8784d7a97dc8baea1745a4cd15ff"
    },
    {
      "path": "src/filler/handlers/atomicassets/processors/templates.ts",
      "sha256": "5d66b578b5f669fae361aeb1807c6497ba398541f8e4c31f81ec85bf3d5794a4"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/auctions.integration.test.ts",
      "sha256": "edb9a1edc875bcd141e8834c131b755bc075bdfa05b52f2249e0156ab6c7cb09"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/auctions.test.ts",
      "sha256": "8aac866f444e4a0e2ca3598a5658ec409d619d97076805ef1a70afc075749a23"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "sha256": "9d9f58cce3f2c778834d8b7e2c30783a0fb5e61aaf63de94a9f9be173c4630a8"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/balances.ts",
      "sha256": "5b4db036377444e2e323538efbe746f038481b68c7b9efe905d08986c9980111"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/bonusfees.ts",
      "sha256": "675a5009ed6e1e6ce73fee12ca3e9f4712a5b15687a57e8e2217f6ab631c5ca6"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/buyoffers.integration.test.ts",
      "sha256": "b501162b7b920726f0db275765757481ca90397e4086f768a22936f2e562f1e4"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/buyoffers.test.ts",
      "sha256": "a60f44e6203ec271dc11c8c4de0572716f36d2d2aa242f0ed823663add426bbb"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/buyoffers.ts",
      "sha256": "7f8df637817a58c771310d7aa60d5c5b3f56a0abe66e86c4aa1dca5180d4cd08"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/config.integration.test.ts",
      "sha256": "89d8222f409bb392e1850e39565689982f4a5b637016123bc6ea1b4d7d3355ad"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/config.ts",
      "sha256": "aa459333563d71571ab87af21d0343d6e3a1c0dbb42a06478ed4e270849ade0f"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "sha256": "5522768c4a6e3be9f77ecdf3453d291df182d17eba081157abf3e244bba20a6e"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/marketplaces.ts",
      "sha256": "0d09452199a5275947bb371465af0c988c51a8ce640c8732c24ab4ac88a34a00"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/royalties.integration.test.ts",
      "sha256": "72b40fb650be28b364a3aba5fa896ec3b6be623c40d7b7aa4a41c86b5611e666"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/royalties.test.ts",
      "sha256": "ae863e09636c190219552e99a58e28bb417b61590b12d84c1403410d6c8e8d28"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "sha256": "6d967a8d699730bf7ccd5a2cc6e246f0d937f3eaa9f3db79b0defa6fc90043c5"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/sales.integration.test.ts",
      "sha256": "57b93f8de29fea133b2bae937ff7659484417d36bca969abe7abf01234da0ae7"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/sales.test.ts",
      "sha256": "41a87979563b9e36036abd0ee094d433064cc214ff8f028227496a378510f58e"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/sales.ts",
      "sha256": "e34e5f1391bd2eeb5a68d035ee73a85cca29c8161454daea137db9165a0302e9"
    },
    {
      "path": "src/filler/handlers/atomicmarket/processors/template-buyoffers.ts",
      "sha256": "3677790e23fa8c1f365b9d9e1dc99e4ba41c53fd83856b92712684485e462dad"
    }
  ],
  "hooks": [
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logmint",
      "processor": "assets",
      "source": "src/filler/handlers/atomicassets/processors/assets.ts",
      "line": 28,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logbackasset",
      "processor": "assets",
      "source": "src/filler/handlers/atomicassets/processors/assets.ts",
      "line": 91,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logburnasset",
      "processor": "assets",
      "source": "src/filler/handlers/atomicassets/processors/assets.ts",
      "line": 124,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logsetdata",
      "processor": "assets",
      "source": "src/filler/handlers/atomicassets/processors/assets.ts",
      "line": 143,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logtransfer",
      "processor": "assets",
      "source": "src/filler/handlers/atomicassets/processors/assets.ts",
      "line": 159,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "balances",
      "processor": "balances",
      "source": "src/filler/handlers/atomicassets/processors/balances.ts",
      "line": 13,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "collections",
      "processor": "collections",
      "source": "src/filler/handlers/atomicassets/processors/collections.ts",
      "line": 15,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "authorswaps",
      "processor": "collections",
      "source": "src/filler/handlers/atomicassets/processors/collections.ts",
      "line": 41,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "config",
      "processor": "config",
      "source": "src/filler/handlers/atomicassets/processors/config.ts",
      "line": 13,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "tokenconfigs",
      "processor": "config",
      "source": "src/filler/handlers/atomicassets/processors/config.ts",
      "line": 54,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "lognewoffer",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 141,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "acceptoffer",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 150,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "declineoffer",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 157,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "canceloffer",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 164,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logmint",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 172,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logburnasset",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 183,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logbackasset",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 194,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logsetdata",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 204,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logrampayer",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 219,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "createcol",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 232,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "addcolauth",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 239,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "forbidnotify",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 246,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "remcolauth",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 253,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "remnotifyacc",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 260,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "setmarketfee",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 267,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "setcoldata",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 274,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "createauswap",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 281,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "acceptauswap",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 291,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "rejectauswap",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 304,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "authorswaps",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 321,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "lognewtempl",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 376,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "locktemplate",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 388,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "deltemplate",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 395,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "redtemplmax",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 402,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logsetdatatl",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 409,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "createschema",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 417,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "extendschema",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 424,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "setschematyp",
      "processor": "logs",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 431,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "lognewoffer",
      "processor": "offers",
      "source": "src/filler/handlers/atomicassets/processors/offers.ts",
      "line": 20,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "acceptoffer",
      "processor": "offers",
      "source": "src/filler/handlers/atomicassets/processors/offers.ts",
      "line": 57,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "declineoffer",
      "processor": "offers",
      "source": "src/filler/handlers/atomicassets/processors/offers.ts",
      "line": 71,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "canceloffer",
      "processor": "offers",
      "source": "src/filler/handlers/atomicassets/processors/offers.ts",
      "line": 85,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logtransfer",
      "processor": "offers",
      "source": "src/filler/handlers/atomicassets/processors/offers.ts",
      "line": 108,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "action",
      "name": "logburnasset",
      "processor": "offers",
      "source": "src/filler/handlers/atomicassets/processors/offers.ts",
      "line": 116,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "schemas",
      "processor": "schemas",
      "source": "src/filler/handlers/atomicassets/processors/schemas.ts",
      "line": 13,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "schematypes",
      "processor": "schemas",
      "source": "src/filler/handlers/atomicassets/processors/schemas.ts",
      "line": 32,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "templates",
      "processor": "templates",
      "source": "src/filler/handlers/atomicassets/processors/templates.ts",
      "line": 15,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "kind": "table",
      "name": "templates2",
      "processor": "templates",
      "source": "src/filler/handlers/atomicassets/processors/templates.ts",
      "line": 82,
      "coverage": "partial"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewauct",
      "processor": "auctions",
      "source": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "line": 24,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "auctions",
      "processor": "auctions",
      "source": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "line": 63,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logauctstart",
      "processor": "auctions",
      "source": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "line": 77,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "cancelauct",
      "processor": "auctions",
      "source": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "line": 93,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "auctionbid",
      "processor": "auctions",
      "source": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "line": 109,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "auctclaimbuy",
      "processor": "auctions",
      "source": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "line": 169,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "auctclaimsel",
      "processor": "auctions",
      "source": "src/filler/handlers/atomicmarket/processors/auctions.ts",
      "line": 205,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "balances",
      "processor": "balances",
      "source": "src/filler/handlers/atomicmarket/processors/balances.ts",
      "line": 13,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "bonusfees",
      "processor": "bonusfees",
      "source": "src/filler/handlers/atomicmarket/processors/bonusfees.ts",
      "line": 13,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewbuyo",
      "processor": "buyoffers",
      "source": "src/filler/handlers/atomicmarket/processors/buyoffers.ts",
      "line": 18,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "cancelbuyo",
      "processor": "buyoffers",
      "source": "src/filler/handlers/atomicmarket/processors/buyoffers.ts",
      "line": 61,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "acceptbuyo",
      "processor": "buyoffers",
      "source": "src/filler/handlers/atomicmarket/processors/buyoffers.ts",
      "line": 77,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "declinebuyo",
      "processor": "buyoffers",
      "source": "src/filler/handlers/atomicmarket/processors/buyoffers.ts",
      "line": 131,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "config",
      "processor": "config",
      "source": "src/filler/handlers/atomicmarket/processors/config.ts",
      "line": 14,
      "coverage": "partial"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewauct",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 47,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logauctstart",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 59,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "cancelauct",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 66,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "auctclaimbuy",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 73,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "auctclaimsel",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 80,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewsale",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 88,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logsalestart",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 99,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "cancelsale",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 106,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "purchasesale",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 113,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewbuyo",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 125,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "cancelbuyo",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 136,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "acceptbuyo",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 145,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "declinebuyo",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 155,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewtbuyo",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 165,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "canceltbuyo",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 176,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "fulfilltbuyo",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 185,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroyfound",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 198,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroytempl",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 208,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroyattr",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 218,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroydust",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 228,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "setdefmktcr",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 238,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "migratebal",
      "processor": "logs",
      "source": "src/filler/handlers/atomicmarket/processors/logs.ts",
      "line": 245,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "marketplaces",
      "processor": "marketplaces",
      "source": "src/filler/handlers/atomicmarket/processors/marketplaces.ts",
      "line": 13,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "royaltyconf",
      "processor": "royalties",
      "source": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "line": 179,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "royaltytemp",
      "processor": "royalties",
      "source": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "line": 207,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "table",
      "name": "royaltyattr",
      "processor": "royalties",
      "source": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "line": 232,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroyfound",
      "processor": "royalties",
      "source": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "line": 267,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroytempl",
      "processor": "royalties",
      "source": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "line": 278,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroyattr",
      "processor": "royalties",
      "source": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "line": 289,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logroydust",
      "processor": "royalties",
      "source": "src/filler/handlers/atomicmarket/processors/royalties.ts",
      "line": 300,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewsale",
      "processor": "sales",
      "source": "src/filler/handlers/atomicmarket/processors/sales.ts",
      "line": 21,
      "coverage": "partial"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "logsalestart",
      "processor": "sales",
      "source": "src/filler/handlers/atomicmarket/processors/sales.ts",
      "line": 50,
      "coverage": "partial"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "cancelsale",
      "processor": "sales",
      "source": "src/filler/handlers/atomicmarket/processors/sales.ts",
      "line": 67,
      "coverage": "partial"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "purchasesale",
      "processor": "sales",
      "source": "src/filler/handlers/atomicmarket/processors/sales.ts",
      "line": 83,
      "coverage": "partial"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "lognewtbuyo",
      "processor": "template-buyoffers",
      "source": "src/filler/handlers/atomicmarket/processors/template-buyoffers.ts",
      "line": 21,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "canceltbuyo",
      "processor": "template-buyoffers",
      "source": "src/filler/handlers/atomicmarket/processors/template-buyoffers.ts",
      "line": 55,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicmarket",
      "kind": "action",
      "name": "fulfilltbuyo",
      "processor": "template-buyoffers",
      "source": "src/filler/handlers/atomicmarket/processors/template-buyoffers.ts",
      "line": 71,
      "coverage": "unimplemented"
    }
  ],
  "lifecycleHooks": [
    {
      "domain": "atomicassets",
      "method": "onPriorityComplete",
      "source": "src/filler/handlers/atomicassets/processors/assets.ts",
      "line": 63,
      "coverage": "partial"
    },
    {
      "domain": "atomicassets",
      "method": "onCommit",
      "source": "src/filler/handlers/atomicassets/processors/logs.ts",
      "line": 355,
      "coverage": "unimplemented"
    },
    {
      "domain": "atomicassets",
      "method": "onCommit",
      "source": "src/filler/handlers/atomicassets/processors/offers.ts",
      "line": 124,
      "coverage": "partial"
    },
    {
      "domain": "atomicmarket",
      "method": "onFork",
      "source": "src/filler/handlers/atomicmarket/processors/config.ts",
      "line": 142,
      "coverage": "unimplemented"
    }
  ],
  "receiverHooks": [
    {
      "contract": "eosio",
      "action": "setcode",
      "method": "handleCodeUpdate",
      "source": "src/filler/receiver.ts",
      "sha256": "39263060066ba50a74f60732a0d16016afbacc950f1d5325af6e6d6c20090d2a",
      "coverage": "partial"
    }
  ]
} as const;
