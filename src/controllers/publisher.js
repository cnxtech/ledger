var boom = require('boom')
var braveHapi = require('../brave-hapi')
var bson = require('bson')
var Joi = require('joi')
var ledgerPublisher = require('ledger-publisher')

var v1 = {}

var rulesetId = 1

/*
   GET /v1/publisher/ruleset
 */

v1.read =
{ handler: function (runtime) {
  return async function (request, reply) {
    reply(runtime.ruleset)
  }
},

  description: 'Returns the publisher identity ruleset',
  tags: [ 'api' ],

  validate:
    { query: {} },

  response:
    { schema: ledgerPublisher.schema }
}

/*
   POST /v1/publisher/ruleset
 */

v1.create =
{ handler: function (runtime) {
  return async function (request, reply) {
    var state
    var debug = braveHapi.debug(module, request)
    var rulesets = runtime.db.get('rulesets', debug)

    state = { $currentDate: { timestamp: { $type: 'timestamp' } },
              $set: { rules: request.payload, type: 'publisher/ruleset' }
            }
    await rulesets.update({ rulesetId: rulesetId }, state, { upsert: true })
    runtime.ruleset = request.payload

    reply({})
  }
},

  auth:
    { strategy: 'session',
      scope: [ 'ledger' ],
      mode: 'required'
    },

  description: 'Defines the publisher identity ruleset',
  tags: [ 'api' ],

  validate:
    { payload: ledgerPublisher.schema },

  response:
    { schema: Joi.any() }
}

/*
   GET /v1/publisher/identity?url=...
 */

v1.identify =
{ handler: function (runtime) {
  return async function (request, reply) {
    var result
    var url = request.query.url

    try {
      result = ledgerPublisher.getPublisher(url)

      reply(result || boom.notFound())
    } catch (err) {
      reply(boom.badData(err.toString()))
    }
  }
},

  description: 'Returns the publisher identity associated with a URL',
  tags: [ 'api' ],

  validate:
    { query: { url: Joi.string().uri({ scheme: /https?/ }).required().description('the URL to parse') } },

  response:
    { schema: Joi.string().optional().description('the publisher identity') }
}

module.exports.routes = [
  braveHapi.routes.async().get().path('/v1/publisher/ruleset').config(v1.read),
  braveHapi.routes.async().post().path('/v1/publisher/ruleset').config(v1.create),
  braveHapi.routes.async().get().path('/v1/publisher/identity').config(v1.identify)
]

module.exports.initialize = async function (debug, runtime) {
  var entry, validity
  var rulesets = runtime.db.get('rulesets', debug)

  runtime.db.checkIndices(debug,
  [ { category: rulesets,
      name: 'rulesets',
      property: 'rulesetId',
      empty: { rulesetId: 0, type: '', timestamp: bson.Timestamp.ZERO },
      unique: [ { rulesetId: 1 } ],
      others: [ { type: 1 }, { timestamp: 1 } ]
    }
  ])

  entry = await rulesets.findOne({ rulesetId: rulesetId })
  runtime.ruleset = entry ? entry.rules : ledgerPublisher.rules
  validity = Joi.validate(runtime.ruleset, ledgerPublisher.schema)
  if (validity.error) throw new Error(validity.error)
}