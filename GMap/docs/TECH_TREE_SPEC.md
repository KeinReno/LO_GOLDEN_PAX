# РўР•РҐРќРћР›РћР“РР вЂ” РРЅСЃС‚СЂСѓРєС†РёСЏ РґР»СЏ AI-Р°РіРµРЅС‚РѕРІ

> Р”РѕРєСѓРјРµРЅС‚ РґР»СЏ СЂР°Р±РѕС‚С‹ AI-Р°РіРµРЅС‚РѕРІ (Qwen Coder, Cursor Рё РґСЂ.) СЃ `technologies.json`.
> Р’РµСЂСЃРёСЏ: **1.0** В· Р”Р°С‚Р°: **2026-08-04**
> РЎРІСЏР·Р°РЅ СЃ: `UI_SYSTEMS_MASTER_SPEC.md`, `CAMPAIGN_TABLE_SPEC.md` В§5, `economy_schema.json`, `ECONOMY_SECTION_SPEC.md`

---

## 0. РћРіР»Р°РІР»РµРЅРёРµ

1. [Р“Р»Р°РІРЅС‹Р№ РїСЂРёРЅС†РёРї](#1-РіР»Р°РІРЅС‹Р№-РїСЂРёРЅС†РёРї)
2. [РЁР°Р±Р»РѕРЅ С‚РµС…РЅРѕР»РѕРіРёРё](#2-С€Р°Р±Р»РѕРЅ-С‚РµС…РЅРѕР»РѕРіРёРё)
3. [JSON Schema (РІР°Р»РёРґР°С†РёСЏ)](#3-json-schema-РІР°Р»РёРґР°С†РёСЏ)
4. [РўРёРїС‹ С‚РµС…РЅРѕР»РѕРіРёР№](#4-С‚РёРїС‹-С‚РµС…РЅРѕР»РѕРіРёР№)
5. [РЎР»РѕРІР°СЂСЊ СЌС„С„РµРєС‚РѕРІ](#5-СЃР»РѕРІР°СЂСЊ-СЌС„С„РµРєС‚РѕРІ)
6. [РўРµРіРё Рё РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ](#6-С‚РµРіРё-Рё-РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ)
7. [РђРїРіСЂРµР№РґС‹](#7-Р°РїРіСЂРµР№РґС‹)
8. [РџСЂРѕС†РµСЃСЃ РґРѕР±Р°РІР»РµРЅРёСЏ С‚РµС…РЅРѕР»РѕРіРёРё](#8-РїСЂРѕС†РµСЃСЃ-РґРѕР±Р°РІР»РµРЅРёСЏ-С‚РµС…РЅРѕР»РѕРіРёРё)
9. [РџСЂРѕС†РµСЃСЃ СѓРґР°Р»РµРЅРёСЏ С‚РµС…РЅРѕР»РѕРіРёРё](#9-РїСЂРѕС†РµСЃСЃ-СѓРґР°Р»РµРЅРёСЏ-С‚РµС…РЅРѕР»РѕРіРёРё)
10. [РџСЂРѕС†РµСЃСЃ РёР·РјРµРЅРµРЅРёСЏ С‚РµС…РЅРѕР»РѕРіРёРё](#10-РїСЂРѕС†РµСЃСЃ-РёР·РјРµРЅРµРЅРёСЏ-С‚РµС…РЅРѕР»РѕРіРёРё)
11. [РђРЅС‚РёРїР°С‚С‚РµСЂРЅС‹ (Р·Р°РїСЂРµС‰РµРЅРѕ)](#11-Р°РЅС‚РёРїР°С‚С‚РµСЂРЅС‹-Р·Р°РїСЂРµС‰РµРЅРѕ)
12. [Р§РµРєР»РёСЃС‚ РїРµСЂРµРґ РєРѕРјРјРёС‚РѕРј](#12-С‡РµРєР»РёСЃС‚-РїРµСЂРµРґ-РєРѕРјРјРёС‚РѕРј)
13. [РџСЂРёРјРµСЂС‹ РґР»СЏ СЂР°Р·РЅС‹С… С„СЂР°РєС†РёР№](#13-РїСЂРёРјРµСЂС‹-РґР»СЏ-СЂР°Р·РЅС‹С…-С„СЂР°РєС†РёР№)

---

## 1. Р“Р»Р°РІРЅС‹Р№ РїСЂРёРЅС†РёРї

> **РўРµС…РЅРѕР»РѕРіРёСЏ РѕРїРёСЃС‹РІР°РµС‚ СЃРµР±СЏ. UI С‚РѕР»СЊРєРѕ С‡РёС‚Р°РµС‚ РѕРїРёСЃР°РЅРёРµ.**

### РџСЂР°РІРёР»Р°

1. **РќРёРєРѕРіРґР° РЅРµ С…Р°СЂРґРєРѕРґРёС‚СЊ id С‚РµС…РЅРѕР»РѕРіРёР№ РІ РєРѕРґРµ** (`.tsx`, `.ts`, `.mjs`).
2. **Р’СЃРµ С‚РµС…РЅРѕР»РѕРіРёРё Р¶РёРІСѓС‚ РІ `technologies.json`** (РёР»Рё content packs).
3. **UI СЂРµРЅРґРµСЂРёС‚ Р»СЋР±С‹Рµ С‚РµС…РЅРѕР»РѕРіРёРё**, РЅРµ Р·РЅР°СЏ РёС… id.
4. **Р­С„С„РµРєС‚С‹ вЂ” СЃР»РѕРІР°СЂСЊ**: РЅРѕРІС‹Р№ СЌС„С„РµРєС‚ = РЅРѕРІР°СЏ Р·Р°РїРёСЃСЊ РІ СЃР»РѕРІР°СЂРµ, РЅРµ `if` РІ РєРѕРґРµ.
5. **Р”РѕСЃС‚СѓРїРЅРѕСЃС‚СЊ С‡РµСЂРµР· С‚РµРіРё**: `tags`, `raceLock`, `factionTraitLock`.
6. **Р’Р°Р»РёРґР°С†РёСЏ РѕР±СЏР·Р°С‚РµР»СЊРЅР°**: РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ JSON РЅРµ РґРѕР»Р¶РµРЅ Р»РѕРјР°С‚СЊ РёРіСЂСѓ.

---

## 2. РЁР°Р±Р»РѕРЅ С‚РµС…РЅРѕР»РѕРіРёРё

### 2.1 РџРѕР»РЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ

```json
{
  "tech.example_name": {
    "id": "tech.example_name",
    "name": "РќР°Р·РІР°РЅРёРµ С‚РµС…РЅРѕР»РѕРіРёРё",
    "category": "A",
    "era": 1,
    "cost": {
      "currency.cognitio": 12
    },
    "iconTag": "extraction",
    "flavor": "РљРѕСЂРѕС‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ С‚РµС…РЅРѕР»РѕРіРёРё (Р»РѕСЂРЅС‹Р№ С‚РµРєСЃС‚)",
    "tags": ["general"],
    "prerequisites": [],
    "effects": [
      {
        "effect": "unlock_tech_tier",
        "args": { "category": "A", "to": 2 }
      }
    ],
    "upgrades": [
      {
        "id": "tech.example_name.efficiency",
        "name": "РќР°Р·РІР°РЅРёРµ Р°РїРіСЂРµР№РґР°",
        "cost": { "currency.cognitio": 6 },
        "effects": [
          { "effect": "production_mult", "args": { "resource": "currency.extracta", "mult": 1.1 } }
        ],
        "prerequisites": []
      },
      {
        "id": "tech.example_name.austerity",
        "name": "Р­РєРѕРЅРѕРјРЅС‹Р№ СЂРµР¶РёРј",
        "cost": { "currency.cognitio": 6 },
        "effects": [
          { "effect": "upkeep_mult", "args": { "resource": "currency.extracta", "mult": 0.9 } }
        ],
        "prerequisites": []
      },
      {
        "id": "tech.example_name.feature",
        "name": "РћСЃРѕР±С‹Р№ СЌС„С„РµРєС‚",
        "cost": { "currency.cognitio": 8 },
        "effects": [
          { "effect": "production_flat", "args": { "resource": "currency.extracta", "amount": 1 } }
        ],
        "prerequisites": ["tech.example_name.efficiency"]
      }
    ]
  }
}
```

### 2.2 РњРёРЅРёРјР°Р»СЊРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ (Р±РµР· Р°РїРіСЂРµР№РґРѕРІ)

```json
{
  "tech.minimal_example": {
    "id": "tech.minimal_example",
    "name": "РњРёРЅРёРјР°Р»СЊРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ",
    "category": "F",
    "era": 2,
    "cost": { "currency.cognitio": 24 },
    "effects": [
      { "effect": "production_mult", "args": { "resource": "currency.cognitio", "mult": 1.1 } }
    ],
    "prerequisites": []
  }
}
```

### 2.3 РџСЂРѕСЂС‹РІРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ (Era 5)

```json
{
  "tech.breakthrough_example": {
    "id": "tech.breakthrough_example",
    "name": "РџСЂРѕСЂС‹РІРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ",
    "category": "D",
    "era": 5,
    "isBreakthrough": true,
    "cost": { "currency.cognitio": 220 },
    "effects": [
      { "effect": "production_mult", "args": { "resource": "currency.energia", "mult": 1.5 } },
      { "effect": "unlock_property", "args": { "property": "matter_destroy" } }
    ],
    "prerequisites": ["tech.d4_example"],
    "upgrades": []
  }
}
```

### 2.4 Р Р°СЃРѕРІР°СЏ СЌРєСЃРєР»СЋР·РёРІРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ

```json
{
  "tech.swarm.adaptation": {
    "id": "tech.swarm.adaptation",
    "name": "Р РѕРµРІР°СЏ Р°РґР°РїС‚Р°С†РёСЏ",
    "category": "E",
    "era": 3,
    "cost": { "currency.cognitio": 42 },
    "raceLock": "race_swarm",
    "tags": ["race_swarm"],
    "effects": [
      { "effect": "production_mult", "args": { "resource": "currency.bios", "mult": 1.25 } }
    ],
    "prerequisites": [],
    "upgrades": []
  }
}
```

### 2.5 РўРµС…РЅРѕР»РѕРіРёСЏ СЃ С‡РµСЂС‚РѕР№ С„СЂР°РєС†РёРё

```json
{
  "tech.technocracy.ai_research": {
    "id": "tech.technocracy.ai_research",
    "name": "РР-РёСЃСЃР»РµРґРѕРІР°РЅРёСЏ",
    "category": "F",
    "era": 2,
    "cost": { "currency.cognitio": 24 },
    "factionTraitLock": "trait.technocracy",
    "tags": ["trait.technocracy"],
    "effects": [
      { "effect": "research_cost_mult", "args": { "category": "F", "mult": 0.92 } }
    ],
    "prerequisites": [],
    "upgrades": []
  }
}
```

### 2.6 РЈРЅРёРєР°Р»СЊРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ С„СЂР°РєС†РёРё

```json
{
  "tech.korvuntai.alien_communication": {
    "id": "tech.korvuntai.alien_communication",
    "name": "РљРѕРЅС‚Р°РєС‚ СЃ РќРµРёР·РІРµСЃС‚РЅС‹Рј",
    "category": "F",
    "era": 4,
    "cost": { "currency.cognitio": 144 },
    "tags": ["faction_korvuntai_unique"],
    "factionTraitLock": "trait.alien_tech",
    "effects": [
      { "effect": "unlock_property", "args": { "property": "corridor_open" } },
      { "effect": "production_mult", "args": { "resource": "currency.cognitio", "mult": 1.3 } }
    ],
    "prerequisites": ["tech.f3_example"],
    "upgrades": []
  }
}
```

---

## 3. JSON Schema (РІР°Р»РёРґР°С†РёСЏ)

РЎРѕС…СЂР°РЅРёС‚СЊ РєР°Рє `content/core/tech_schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Technologies Schema",
  "type": "object",
  "patternProperties": {
    "^tech\\.[a-z0-9_.]+$": {
      "type": "object",
      "required": ["id", "name", "category", "era", "cost", "effects"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^tech\\.[a-z0-9_.]+$"
        },
        "name": {
          "type": "string",
          "minLength": 1
        },
        "category": {
          "type": "string",
          "enum": ["A", "B", "C", "D", "E", "F"]
        },
        "era": {
          "type": "integer",
          "minimum": 1,
          "maximum": 5
        },
        "cost": {
          "type": "object",
          "properties": {
            "currency.cognitio": {
              "type": "integer",
              "minimum": 1
            }
          },
          "required": ["currency.cognitio"]
        },
        "iconTag": {
          "type": "string",
          "enum": [
            "extraction", "metallurgy", "industry", "energy",
            "biology", "psionics", "megastructure", "trade", "diplomacy"
          ]
        },
        "flavor": {
          "type": "string",
          "maxLength": 200
        },
        "tags": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^(race_|faction_|trait\\.)([a-z0-9_]+)|general|breakthrough|unique$"
          }
        },
        "raceLock": {
          "type": "string",
          "pattern": "^race_[a-z]+$"
        },
        "factionTraitLock": {
          "type": "string",
          "pattern": "^trait\\.[a-z_]+$"
        },
        "isBreakthrough": {
          "type": "boolean"
        },
        "prerequisites": {
          "type": "array",
          "items": {
            "type": "string",
            "pattern": "^tech\\.[a-z0-9_.]+$"
          }
        },
        "effects": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/effect"
          },
          "minItems": 1
        },
        "upgrades": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/upgrade"
          },
          "maxItems": 3
        },
        "requireProperties": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  },
  "definitions": {
    "effect": {
      "type": "object",
      "required": ["effect", "args"],
      "properties": {
        "effect": {
          "type": "string",
          "enum": [
            "unlock_tech_tier",
            "unlock_property",
            "production_mult",
            "upkeep_mult",
            "production_flat",
            "research_cost_mult",
            "unit_upgrade",
            "stat_mult",
            "capacity_add",
            "ap_add",
            "cost_mult"
          ]
        },
        "args": {
          "type": "object"
        }
      }
    },
    "upgrade": {
      "type": "object",
      "required": ["id", "name", "cost", "effects"],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^tech\\.[a-z0-9_.]+\\.(efficiency|austerity|feature)$"
        },
        "name": {
          "type": "string"
        },
        "cost": {
          "type": "object",
          "properties": {
            "currency.cognitio": {
              "type": "integer",
              "minimum": 1
            }
          }
        },
        "effects": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/effect"
          }
        },
        "prerequisites": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    }
  }
}
```

---

## 4. РўРёРїС‹ С‚РµС…РЅРѕР»РѕРіРёР№

| РўРёРї | РћРїРёСЃР°РЅРёРµ | РћР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ |
|---|---|---|
| **РћР±С‰Р°СЏ** | Р”РѕСЃС‚СѓРїРЅР° РІСЃРµРј С„СЂР°РєС†РёСЏРј | `tags: ["general"]` РёР»Рё Р±РµР· С‚РµРіРѕРІ |
| **Р Р°СЃРѕРІР°СЏ** | РўСЂРµР±СѓРµС‚ СЂР°СЃСѓ в‰Ґ30% | `raceLock: "race_xxx"` + `tags: ["race_xxx"]` |
| **Р§РµСЂС‚Р° С„СЂР°РєС†РёРё** | РўСЂРµР±СѓРµС‚ С‡РµСЂС‚Сѓ | `factionTraitLock: "trait.xxx"` |
| **Р¤СЂР°РєС†РёРѕРЅРЅР°СЏ СѓРЅРёРєР°Р»СЊРЅР°СЏ** | РўРѕР»СЊРєРѕ РґР»СЏ РєРѕРЅРєСЂРµС‚РЅРѕР№ С„СЂР°РєС†РёРё | `tags: ["faction_xxx_unique"]` |
| **РџСЂРѕСЂС‹РІРЅР°СЏ** | Era 5, end-game | `isBreakthrough: true` + `era: 5` |
| **РќР°СЃР»РµРґСЃС‚РІРµРЅРЅР°СЏ** | РџРѕР»СѓС‡РµРЅР° С‡РµСЂРµР· РёСЃС‚РѕСЂРёСЋ | Р’ `acquiredTechs`, РЅРµ РІ `technologies.json` |

---

## 5. РЎР»РѕРІР°СЂСЊ СЌС„С„РµРєС‚РѕРІ

### 5.1 РџРѕР»РЅС‹Р№ СЃРїРёСЃРѕРє СЌС„С„РµРєС‚РѕРІ

| Р­С„С„РµРєС‚ | РќР°Р·РЅР°С‡РµРЅРёРµ | РђСЂРіСѓРјРµРЅС‚С‹ |
|---|---|---|
| `unlock_tech_tier` | РћС‚РєСЂС‹РІР°РµС‚ С‚РёСЂ Р·РґР°РЅРёР№ РєР°С‚РµРіРѕСЂРёРё | `category: "A"-"F"`, `to: 2-10` |
| `unlock_property` | Р Р°Р·Р±Р»РѕРєРёСЂСѓРµС‚ СЃРІРѕР№СЃС‚РІРѕ СЂРµСЃСѓСЂСЃРѕРІ | `property: "shield"` Рё С‚.Рґ. |
| `production_mult` | РњРЅРѕР¶РёС‚РµР»СЊ РїСЂРѕРёР·РІРѕРґСЃС‚РІР° | `resource: "currency.x"`, `mult: 1.1` |
| `upkeep_mult` | РњРЅРѕР¶РёС‚РµР»СЊ Р°РїРєРёРїР° | `resource: "currency.x"`, `mult: 0.9` |
| `production_flat` | РџР»РѕСЃРєРёР№ Р±РѕРЅСѓСЃ РїСЂРѕРёР·РІРѕРґСЃС‚РІР° | `resource: "currency.x"`, `amount: 2` |
| `research_cost_mult` | РЎРєРёРґРєР° РЅР° РёСЃСЃР»РµРґРѕРІР°РЅРёСЏ | `category: "A"-"F"`, `mult: 0.92` |
| `unit_upgrade` | РђРїРіСЂРµР№Рґ СЋРЅРёС‚РѕРІ | `from: "ship.corvette"`, `to: "ship.frigate"` |
| `stat_mult` | РњРЅРѕР¶РёС‚РµР»СЊ СЃС‚Р°С‚Р° | `stat: "damage"`, `mult: 1.2` |
| `capacity_add` | Р”РѕР±Р°РІР»СЏРµС‚ С‘РјРєРѕСЃС‚СЊ | `category: "A"-"F"`, `tier: 4`, `amount: 1` |
| `ap_add` | Р”РѕР±Р°РІР»СЏРµС‚ РѕС‡РєРё РґРµР№СЃС‚РІРёР№ | `amount: 1` |
| `cost_mult` | РњРЅРѕР¶РёС‚РµР»СЊ СЃС‚РѕРёРјРѕСЃС‚Рё РїРѕСЃС‚СЂРѕРµРє | `tag: "build"`, `mult: 0.9` |

### 5.2 РџСЂРёРјРµСЂС‹ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ

```json
// РћС‚РєСЂС‹С‚РёРµ С‚РёСЂР°
{ "effect": "unlock_tech_tier", "args": { "category": "B", "to": 4 } }

// РњРЅРѕР¶РёС‚РµР»СЊ РїСЂРѕРёР·РІРѕРґСЃС‚РІР°
{ "effect": "production_mult", "args": { "resource": "currency.materia", "mult": 1.15 } }

// РђРїРіСЂРµР№Рґ СЋРЅРёС‚Р°
{ "effect": "unit_upgrade", "args": { "from": "ship.corvette", "to": "ship.frigate" } }

// Р Р°Р·Р±Р»РѕРєРёСЂРѕРІРєР° СЃРІРѕР№СЃС‚РІР°
{ "effect": "unlock_property", "args": { "property": "shield" } }
```

---

## 6. РўРµРіРё Рё РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ

### 6.1 РџСЂР°РІРёР»Р° С‚РµРіРѕРІ

| РўРµРі | Р—РЅР°С‡РµРЅРёРµ |
|---|---|
| `general` | Р”РѕСЃС‚СѓРїРЅР° РІСЃРµРј С„СЂР°РєС†РёСЏРј |
| `race_human` | РўРѕР»СЊРєРѕ РґР»СЏ Р»СЋРґРµР№ |
| `race_elan` | РўРѕР»СЊРєРѕ РґР»СЏ СЌР»Р°РЅРѕРІ |
| `race_horn` | РўРѕР»СЊРєРѕ РґР»СЏ С…РѕСЂРЅРѕРІ |
| `race_synth` | РўРѕР»СЊРєРѕ РґР»СЏ РјРµС…Р°РЅРёСЃС‚РѕРІ |
| `race_swarm` | РўРѕР»СЊРєРѕ РґР»СЏ Р РѕСЏ |
| `race_psionic` | РўРѕР»СЊРєРѕ РґР»СЏ РїСЃРёРѕРЅРёРєРѕРІ |
| `race_lithoid` | РўРѕР»СЊРєРѕ РґР»СЏ Р»РёС‚РѕРёРґРѕРІ |
| `race_unknown` | РўРѕР»СЊРєРѕ РґР»СЏ РЅРµРёР·РІРµСЃС‚РЅС‹С… СЂР°СЃ |
| `faction_xxx_unique` | РЈРЅРёРєР°Р»СЊРЅР°СЏ РґР»СЏ С„СЂР°РєС†РёРё xxx |
| `trait.xxx` | РўСЂРµР±СѓРµС‚ С‡РµСЂС‚Сѓ xxx |
| `breakthrough` | РџСЂРѕСЂС‹РІРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ |

### 6.2 Р›РѕРіРёРєР° РґРѕСЃС‚СѓРїРЅРѕСЃС‚Рё

РўРµС…РЅРѕР»РѕРіРёСЏ РґРѕСЃС‚СѓРїРЅР° С„СЂР°РєС†РёРё, РµСЃР»Рё:

```
1. РўРµРіРё С‚РµС…РЅРѕР»РѕРіРёРё в€© availableRaces С„СЂР°РєС†РёРё в‰  в€…
   РР›Р С‚РµС…РЅРѕР»РѕРіРёСЏ Р±РµР· С‚РµРіРѕРІ
   РР›Р tags СЃРѕРґРµСЂР¶РёС‚ "general"

2. raceLock РІС‹РїРѕР»РЅРµРЅ (в‰Ґ30% РЅР°СЃРµР»РµРЅРёСЏ СЂР°СЃС‹)
   РР›Р raceLock РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚

3. factionTraitLock РІС‹РїРѕР»РЅРµРЅ
   РР›Р factionTraitLock РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚

4. Р’СЃРµ prerequisites РёР·СѓС‡РµРЅС‹
```

### 6.3 РџСЂРёРјРµСЂС‹ С„СЂР°РєС†РёР№

**РРјРїРµСЂРёСЏ Р‘РµР»Р°С‚РѕСЂ:**
```json
{
  "id": "faction_belator",
  "availableRaces": ["race_human", "race_elan", "race_horn", "race_swarm"],
  "traits": ["trait.imperial", "trait.multi_species"]
}
```
- Р”РѕСЃС‚СѓРїРЅС‹: РѕР±С‰РёРµ + С‡РµР»РѕРІРµС‡РµСЃРєРёРµ + СЌР»Р°РЅСЃРєРёРµ + С…РѕСЂРЅСЃРєРёРµ + СЂРѕРµРІС‹Рµ

**РњРѕРЅР°СЂС…РёСЏ РљР°СЂРЅРµРґ:**
```json
{
  "id": "faction_karned",
  "availableRaces": ["race_elan", "race_lithoid", "race_synth"],
  "traits": ["trait.mechanization"]
}
```
- Р”РѕСЃС‚СѓРїРЅС‹: РѕР±С‰РёРµ + СЌР»Р°РЅСЃРєРёРµ + Р»РёС‚РѕРёРґСЃРєРёРµ + РјРµС…Р°РЅРёСЃС‚СЃРєРёРµ
- РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЂРѕРµРІС‹Рј, С‡РµР»РѕРІРµС‡РµСЃРєРёРј

**Р“РЅРёС‡Рё (РєРѕР»Р»РµРєС†РёРѕРЅРµСЂС‹):**
```json
{
  "id": "faction_gnichi",
  "availableRaces": ["race_human", "race_psionic", "race_synth", "race_swarm", "race_elan", "race_horn"],
  "traits": ["trait.tech_collector"]
}
```
- Р”РѕСЃС‚СѓРїРЅС‹ РїРѕС‡С‚Рё РІСЃРµ С‚РµС…РЅРѕР»РѕРіРёРё

**РўСѓСЂР°РЅРјР°Р» (С‚РѕР»СЊРєРѕ Р»СЋРґРё):**
```json
{
  "id": "faction_turanmal",
  "availableRaces": ["race_human"],
  "traits": ["trait.purist"]
}
```
- Р”РѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РѕР±С‰РёРµ + С‡РµР»РѕРІРµС‡РµСЃРєРёРµ

**РљРѕСЂРІСѓРЅРўР°Р№ (СѓРЅРёРєР°Р»СЊРЅС‹Рµ):**
```json
{
  "id": "faction_korvuntai",
  "availableRaces": ["race_human", "race_unknown"],
  "traits": ["trait.alien_tech"]
}
```
- Р”РѕСЃС‚СѓРїРЅС‹: РѕР±С‰РёРµ + С‡РµР»РѕРІРµС‡РµСЃРєРёРµ + СѓРЅРёРєР°Р»СЊРЅС‹Рµ

---

## 7. РђРїРіСЂРµР№РґС‹

### 7.1 РџСЂР°РІРёР»Р°

- РљР°Р¶РґР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ РёРјРµРµС‚ **РјР°РєСЃРёРјСѓРј 3 Р°РїРіСЂРµР№РґР°**: `efficiency`, `austerity`, `feature`.
- РђРїРіСЂРµР№РґС‹ С‚СЂРµР±СѓСЋС‚ РёР·СѓС‡РµРЅРЅСѓСЋ Р±Р°Р·РѕРІСѓСЋ С‚РµС…РЅРѕР»РѕРіРёСЋ.
- `feature` РјРѕР¶РµС‚ С‚СЂРµР±РѕРІР°С‚СЊ `efficiency` РєР°Рє prerequisite.
- **РџСЂРѕСЂС‹РІРЅС‹Рµ С‚РµС…РЅРѕР»РѕРіРёРё РЅРµ РёРјРµСЋС‚ Р°РїРіСЂРµР№РґРѕРІ.**

### 7.2 РЎС‚СЂСѓРєС‚СѓСЂР° Р°РїРіСЂРµР№РґР°

```json
{
  "id": "tech.example.efficiency",
  "name": "Р­С„С„РµРєС‚РёРІРЅС‹Р№ СЂРµР¶РёРј",
  "cost": { "currency.cognitio": 6 },
  "effects": [
    { "effect": "production_mult", "args": { "resource": "currency.extracta", "mult": 1.1 } }
  ],
  "prerequisites": []
}
```

### 7.3 РЎС‚РѕРёРјРѕСЃС‚СЊ Р°РїРіСЂРµР№РґРѕРІ

| Р­РїРѕС…Р° | Р‘Р°Р·РѕРІР°СЏ СЃС‚РѕРёРјРѕСЃС‚СЊ | РђРїРіСЂРµР№Рґ |
|---|---|---|
| Era 1 | 12-14 | 6 |
| Era 2 | 24-28 | 10-11 |
| Era 3 | 42 | 17-23 |
| Era 4 | 144 | 58-79 |
| Era 5 | 144-220 | РќРµС‚ Р°РїРіСЂРµР№РґРѕРІ |

---

## 8. РџСЂРѕС†РµСЃСЃ РґРѕР±Р°РІР»РµРЅРёСЏ С‚РµС…РЅРѕР»РѕРіРёРё

### РЁР°Рі 1: РћРїСЂРµРґРµР»РёС‚СЊ С‚РёРї С‚РµС…РЅРѕР»РѕРіРёРё

- РћР±С‰Р°СЏ? Р Р°СЃРѕРІР°СЏ? Р¤СЂР°РєС†РёРѕРЅРЅР°СЏ? РџСЂРѕСЂС‹РІРЅР°СЏ?

### РЁР°Рі 2: РЎРѕР·РґР°С‚СЊ РѕР±СЉРµРєС‚ РІ JSON

```json
"tech.new_technology": {
  "id": "tech.new_technology",
  "name": "РќРѕРІР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ",
  "category": "B",
  "era": 2,
  "cost": { "currency.cognitio": 24 },
  "iconTag": "metallurgy",
  "flavor": "Р›РѕСЂРЅРѕРµ РѕРїРёСЃР°РЅРёРµ С‚РµС…РЅРѕР»РѕРіРёРё",
  "tags": ["general"],
  "prerequisites": ["tech.base_tech"],
  "effects": [
    { "effect": "production_mult", "args": { "resource": "currency.materia", "mult": 1.15 } }
  ],
  "upgrades": [
    {
      "id": "tech.new_technology.efficiency",
      "name": "РЈР»СѓС‡С€РµРЅРёРµ",
      "cost": { "currency.cognitio": 11 },
      "effects": [
        { "effect": "production_mult", "args": { "resource": "currency.materia", "mult": 1.1 } }
      ],
      "prerequisites": []
    }
  ]
}
```

### РЁР°Рі 3: РџСЂРѕРІРµСЂРёС‚СЊ РІР°Р»РёРґР°С†РёСЋ

```bash
node scripts/validateContent.mjs
```

### РЁР°Рі 4: РџСЂРѕРІРµСЂРёС‚СЊ РїСЂРµСЂРµРєРІРёР·РёС‚С‹

- Р’СЃРµ `prerequisites` СЃСѓС‰РµСЃС‚РІСѓСЋС‚ РІ `technologies.json`.
- РќРµС‚ С†РёРєР»РёС‡РµСЃРєРёС… Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№.

### РЁР°Рі 5: РџСЂРѕРІРµСЂРёС‚СЊ СЃС‚РѕРёРјРѕСЃС‚СЊ

- РЎС‚РѕРёРјРѕСЃС‚СЊ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ СЌРїРѕС…Рµ (СЃРј. С‚Р°Р±Р»РёС†Сѓ РІС‹С€Рµ).
- РђРїРіСЂРµР№РґС‹ СЃС‚РѕСЏС‚ ~50% РѕС‚ Р±Р°Р·РѕРІРѕР№ СЃС‚РѕРёРјРѕСЃС‚Рё.

---

## 9. РџСЂРѕС†РµСЃСЃ СѓРґР°Р»РµРЅРёСЏ С‚РµС…РЅРѕР»РѕРіРёРё

### РЁР°Рі 1: РџСЂРѕРІРµСЂРёС‚СЊ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё

```bash
grep -n "tech.removed_tech" content/core/technologies.json
```

- Р•СЃР»Рё РµСЃС‚СЊ С‚РµС…РЅРѕР»РѕРіРёРё СЃ `prerequisites: ["tech.removed_tech"]` вЂ” РѕР±РЅРѕРІРёС‚СЊ РёС….
- Р•СЃР»Рё РµСЃС‚СЊ РёРіСЂРѕРєРё СЃ СЌС‚РѕР№ С‚РµС…РЅРѕР»РѕРіРёРµР№ РІ `unlockedTechs` вЂ” РґРѕР±Р°РІРёС‚СЊ РјРёРіСЂР°С†РёСЋ.

### РЁР°Рі 2: Р”РѕР±Р°РІРёС‚СЊ РјРёРіСЂР°С†РёСЋ

Р’ `content/core/id-aliases.json`:

```json
{
  "tech.removed_tech": "tech.replacement_tech"
}
```

### РЁР°Рі 3: РЈРґР°Р»РёС‚СЊ РѕР±СЉРµРєС‚

### РЁР°Рі 4: РџСЂРѕРІРµСЂРёС‚СЊ РІР°Р»РёРґР°С†РёСЋ

```bash
node scripts/validateContent.mjs
```

---

## 10. РџСЂРѕС†РµСЃСЃ РёР·РјРµРЅРµРЅРёСЏ С‚РµС…РЅРѕР»РѕРіРёРё

### РЁР°Рі 1: РР·РјРµРЅРёС‚СЊ РїРѕР»СЏ

```json
"effects": [
  { "effect": "production_mult", "args": { "resource": "currency.materia", "mult": 1.25 } }
]
```

### РЁР°Рі 2: РџСЂРѕРІРµСЂРёС‚СЊ РІР°Р»РёРґР°С†РёСЋ

### РЁР°Рі 3: РџСЂРѕРІРµСЂРёС‚СЊ Р±Р°Р»Р°РЅСЃ

- Р•СЃР»Рё СЃС‚РѕРёРјРѕСЃС‚СЊ РёР·РјРµРЅРёР»Р°СЃСЊ вЂ” РїСЂРѕРІРµСЂРёС‚СЊ, С‡С‚Рѕ СЌС‚Рѕ РЅРµ Р»РѕРјР°РµС‚ СЌРєРѕРЅРѕРјРёРєСѓ.
- Р•СЃР»Рё СЌС„С„РµРєС‚С‹ РёР·РјРµРЅРёР»РёСЃСЊ вЂ” РїСЂРѕРІРµСЂРёС‚СЊ, С‡С‚Рѕ СЌС‚Рѕ РЅРµ РґР°С‘С‚ СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№ Р±РѕРЅСѓСЃ.

---

## 11. РђРЅС‚РёРїР°С‚С‚РµСЂРЅС‹ (Р·Р°РїСЂРµС‰РµРЅРѕ)

### вќЊ РҐР°СЂРґРєРѕРґ id РІ РєРѕРґРµ

```tsx
// Р—РђРџР Р•Р©Р•РќРћ
if (techId === 'tech.swarm.adaptation') {
  showSpecialUI();
}
```

### вќЊ РҐР°СЂРґРєРѕРґ СЌС„С„РµРєС‚РѕРІ РІ UI

```tsx
// Р—РђРџР Р•Р©Р•РќРћ
if (effect.effect === 'unlock_tech_tier' && effect.args.category === 'F') {
  // СЃРїРµС†РёР°Р»СЊРЅР°СЏ Р»РѕРіРёРєР°
}
```

### вќЊ РҐР°СЂРґРєРѕРґ РёРєРѕРЅРѕРє РїРѕ id

```tsx
// Р—РђРџР Р•Р©Р•РќРћ
const icons = {
  'tech.geology': 'в›ЏпёЏ',
  'tech.materials_science': 'рџ”©',
};
```

### вќЊ Р”СѓР±Р»РёСЂРѕРІР°РЅРёРµ РґР°РЅРЅС‹С…

```json
// Р—РђРџР Р•Р©Р•РќРћ
{
  "tech.example": {
    "effects": [...],
    "effectsCopy": [...]  // РґСѓР±Р»РёСЂРѕРІР°РЅРёРµ!
  }
}
```

### вќЊ Р¦РёРєР»РёС‡РµСЃРєРёРµ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё

```json
// Р—РђРџР Р•Р©Р•РќРћ
"tech.a": { "prerequisites": ["tech.b"] },
"tech.b": { "prerequisites": ["tech.a"] }
```

---

## 12. Р§РµРєР»РёСЃС‚ РїРµСЂРµРґ РєРѕРјРјРёС‚РѕРј

РџРµСЂРµРґ РєРѕРјРјРёС‚РѕРј РїСЂРѕРІРµСЂРёС‚СЊ:

- [ ] Р’СЃРµ С‚РµС…РЅРѕР»РѕРіРёРё РїСЂРѕС…РѕРґСЏС‚ JSON Schema РІР°Р»РёРґР°С†РёСЋ.
- [ ] РќРµС‚ РґСѓР±Р»РёРєР°С‚РѕРІ id.
- [ ] Р’СЃРµ `prerequisites` СЃСѓС‰РµСЃС‚РІСѓСЋС‚.
- [ ] РќРµС‚ С†РёРєР»РёС‡РµСЃРєРёС… Р·Р°РІРёСЃРёРјРѕСЃС‚РµР№.
- [ ] РЎС‚РѕРёРјРѕСЃС‚СЊ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ СЌРїРѕС…Рµ.
- [ ] РђРїРіСЂРµР№РґС‹ РёРјРµСЋС‚ РїСЂР°РІРёР»СЊРЅС‹Рµ id (`efficiency`, `austerity`, `feature`).
- [ ] РўРµРіРё РєРѕСЂСЂРµРєС‚РЅС‹ (`race_xxx`, `faction_xxx_unique`, `trait.xxx`).
- [ ] Р Р°СЃРѕРІС‹Рµ locks РёРјРµСЋС‚ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓСЋС‰РёРµ С‚РµРіРё.
- [ ] РџСЂРѕСЂС‹РІРЅС‹Рµ С‚РµС…РЅРѕР»РѕРіРёРё РЅРµ РёРјРµСЋС‚ Р°РїРіСЂРµР№РґРѕРІ.
- [ ] Р¤Р»РµР№РІРѕСЂ-С‚РµРєСЃС‚ РЅРµ РїСЂРµРІС‹С€Р°РµС‚ 200 СЃРёРјРІРѕР»РѕРІ.
- [ ] Р—Р°РїСѓС‰РµРЅ `node scripts/validateContent.mjs` Р±РµР· РѕС€РёР±РѕРє.

---

## 13. РџСЂРёРјРµСЂС‹ РґР»СЏ СЂР°Р·РЅС‹С… С„СЂР°РєС†РёР№

### 13.1 РРјРїРµСЂРёСЏ Р‘РµР»Р°С‚РѕСЂ (Р»СЋРґРё + СЌР»Р°РЅС‹ + С…РѕСЂРЅС‹ + Р РѕР№)

```json
// РћР±С‰РёРµ С‚РµС…РЅРѕР»РѕРіРёРё
"tech.belator.imperial_unity": {
  "id": "tech.belator.imperial_unity",
  "name": "РРјРїРµСЂСЃРєРѕРµ РµРґРёРЅСЃС‚РІРѕ",
  "category": "E",
  "era": 2,
  "cost": { "currency.cognitio": 28 },
  "tags": ["faction_belator_unique"],
  "effects": [
    { "effect": "production_mult", "args": { "resource": "currency.bios", "mult": 1.15 } }
  ]
},

// Р РѕРµРІР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ (РґРѕСЃС‚СѓРїРЅР° Р±Р»Р°РіРѕРґР°СЂСЏ Р РѕСЏ РІ СЃРѕСЃС‚Р°РІРµ)
"tech.belator.swarm_integration": {
  "id": "tech.belator.swarm_integration",
  "name": "РРЅС‚РµРіСЂР°С†РёСЏ Р РѕСЏ",
  "category": "E",
  "era": 3,
  "cost": { "currency.cognitio": 42 },
  "raceLock": "race_swarm",
  "tags": ["race_swarm"],
  "effects": [
    { "effect": "production_mult", "args": { "resource": "currency.bios", "mult": 1.25 } }
  ]
}
```

### 13.2 РњРѕРЅР°СЂС…РёСЏ РљР°СЂРЅРµРґ (СЌР»Р°РЅС‹ в†’ Р»РёС‚РѕРёРґС‹ в†’ РјРµС…Р°РЅРёСЃС‚С‹)

```json
// Р­Р»Р°РЅСЃРєР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ
"tech.karned.crystal_synthesis": {
  "id": "tech.karned.crystal_synthesis",
  "name": "РљСЂРёСЃС‚Р°Р»СЊРЅС‹Р№ СЃРёРЅС‚РµР·",
  "category": "B",
  "era": 2,
  "cost": { "currency.cognitio": 24 },
  "tags": ["race_elan"],
  "effects": [
    { "effect": "production_mult", "args": { "resource": "currency.materia", "mult": 1.15 } }
  ]
},

// Р›РёС‚РѕРёРґСЃРєР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ
"tech.karned.lithoid_architecture": {
  "id": "tech.karned.lithoid_architecture",
  "name": "Р›РёС‚РѕРёРґРЅР°СЏ Р°СЂС…РёС‚РµРєС‚СѓСЂР°",
  "category": "C",
  "era": 3,
  "cost": { "currency.cognitio": 42 },
  "tags": ["race_lithoid"],
  "effects": [
    { "effect": "production_mult", "args": { "resource": "currency.industria", "mult": 1.2 } }
  ]
},

// РњРµС…Р°РЅРёСЃС‚СЃРєР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ (РїРµСЂРµС…РѕРґ)
"tech.karned.synthetic_uplift": {
  "id": "tech.karned.synthetic_uplift",
  "name": "РЎРёРЅС‚РµС‚РёС‡РµСЃРєРёР№ Р°РїР»РёС„С‚",
  "category": "C",
  "era": 4,
  "cost": { "currency.cognitio": 144 },
  "tags": ["race_synth"],
  "effects": [
    { "effect": "unit_upgrade", "args": { "from": "unit.line_infantry", "to": "unit.synth_legion" } }
  ]
}
```

### 13.3 Р“РЅРёС‡Рё (РєРѕР»Р»РµРєС†РёРѕРЅРµСЂС‹ С‚РµС…РЅРѕР»РѕРіРёР№)

```json
// РЎРїРµС†РёР°Р»СЊРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ РґР»СЏ РєРѕР»Р»РµРєС†РёРѕРЅРµСЂРѕРІ
"tech.gnichi.tech_assimilation": {
  "id": "tech.gnichi.tech_assimilation",
  "name": "РўРµС…РЅРѕР»РѕРіРёС‡РµСЃРєР°СЏ Р°СЃСЃРёРјРёР»СЏС†РёСЏ",
  "category": "F",
  "era": 3,
  "cost": { "currency.cognitio": 42 },
  "factionTraitLock": "trait.tech_collector",
  "tags": ["trait.tech_collector"],
  "effects": [
    { "effect": "research_cost_mult", "args": { "mult": 0.85 } }
  ]
}
```

### 13.4 РўСѓСЂР°РЅРјР°Р» (С‚РѕР»СЊРєРѕ Р»СЋРґРё)

```json
// Р§РµР»РѕРІРµС‡РµСЃРєР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ
"tech.turanmal.human_purism": {
  "id": "tech.turanmal.human_purism",
  "name": "Р§РµР»РѕРІРµС‡РµСЃРєРёР№ РїСѓСЂРёС‚РёР·Рј",
  "category": "E",
  "era": 2,
  "cost": { "currency.cognitio": 24 },
  "tags": ["race_human"],
  "effects": [
    { "effect": "production_mult", "args": { "resource": "currency.bios", "mult": 1.1 } }
  ]
}
```

### 13.5 РљРѕСЂРІСѓРЅРўР°Р№ (СѓРЅРёРєР°Р»СЊРЅС‹Рµ С‚РµС…РЅРѕР»РѕРіРёРё)

```json
// РЈРЅРёРєР°Р»СЊРЅР°СЏ С‚РµС…РЅРѕР»РѕРіРёСЏ РЅРµРёР·РІРµСЃС‚РЅРѕРіРѕ РїСЂРѕРёСЃС…РѕР¶РґРµРЅРёСЏ
"tech.korvuntai.alien_communication": {
  "id": "tech.korvuntai.alien_communication",
  "name": "РљРѕРЅС‚Р°РєС‚ СЃ РќРµРёР·РІРµСЃС‚РЅС‹Рј",
  "category": "F",
  "era": 4,
  "cost": { "currency.cognitio": 144 },
  "tags": ["faction_korvuntai_unique"],
  "factionTraitLock": "trait.alien_tech",
  "effects": [
    { "effect": "unlock_property", "args": { "property": "corridor_open" } },
    { "effect": "production_mult", "args": { "resource": "currency.cognitio", "mult": 1.3 } }
  ]
}
```

---

## РЎРІСЏР·Р°РЅРЅС‹Рµ С„Р°Р№Р»С‹

- `content/core/technologies.json` вЂ” РѕСЃРЅРѕРІРЅРѕР№ С„Р°Р№Р» С‚РµС…РЅРѕР»РѕРіРёР№.
- `content/core/id-aliases.json` вЂ” РјРёРіСЂР°С†РёРё id.
- `content/core/tech_icons.json` вЂ” РёРєРѕРЅРєРё РїРѕ С‚РµРіР°Рј.
- `content/core/tech_schema.json` вЂ” JSON Schema РґР»СЏ РІР°Р»РёРґР°С†РёРё.
- `scripts/validateContent.mjs` вЂ” СЃРєСЂРёРїС‚ РІР°Р»РёРґР°С†РёРё.
- `src/state/techRegistry.ts` вЂ” registry РґР»СЏ UI.
- `src/state/EffectRenderers.ts` вЂ” СЂРµРЅРґРµСЂРµСЂС‹ СЌС„С„РµРєС‚РѕРІ.

---

## РџСЂРёРјРµС‡Р°РЅРёСЏ РґР»СЏ Р°РіРµРЅС‚РѕРІ

1. **РќРёРєРѕРіРґР° РЅРµ СЂРµРґР°РєС‚РёСЂСѓР№С‚Рµ UI-РєРѕРґ** РґР»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ РЅРѕРІС‹С… С‚РµС…РЅРѕР»РѕРіРёР№.
2. **Р’СЃРµРіРґР° РїСЂРѕРІРµСЂСЏР№С‚Рµ РІР°Р»РёРґР°С†РёСЋ** РїРµСЂРµРґ РєРѕРјРјРёС‚РѕРј.
3. **РСЃРїРѕР»СЊР·СѓР№С‚Рµ С‚РµРіРё**, Р° РЅРµ С…Р°СЂРґРєРѕРґ РІ РєРѕРґРµ.
4. **Р¤Р»РµР№РІРѕСЂ-С‚РµРєСЃС‚** РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РєСЂР°С‚РєРёРј Рё Р°С‚РјРѕСЃС„РµСЂРЅС‹Рј.
5. **РЎС‚РѕРёРјРѕСЃС‚СЊ** РґРѕР»Р¶РЅР° СЃРѕРѕС‚РІРµС‚СЃС‚РІРѕРІР°С‚СЊ СЌРїРѕС…Рµ.
6. **РђРїРіСЂРµР№РґС‹** вЂ” С‚РѕР»СЊРєРѕ 3 С‚РёРїР°: efficiency, austerity, feature.
7. **РџСЂРѕСЂС‹РІРЅС‹Рµ С‚РµС…РЅРѕР»РѕРіРёРё** вЂ” Р±РµР· Р°РїРіСЂРµР№РґРѕРІ.