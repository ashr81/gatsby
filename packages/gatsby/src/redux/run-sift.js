// @flow
const sift = require(`sift`)
const _ = require(`lodash`)
const prepareRegex = require(`../utils/prepare-regex`)
const { resolveNodes, resolveRecursive } = require(`./prepare-nodes`)
const { makeRe } = require(`micromatch`)
const { getQueryFields } = require(`../db/common/query`)
const { getValueAt } = require(`../utils/get-value-at`)

/////////////////////////////////////////////////////////////////////
// Parse filter
/////////////////////////////////////////////////////////////////////

const prepareQueryArgs = (filterFields = {}) =>
  Object.keys(filterFields).reduce((acc, key) => {
    const value = filterFields[key]
    if (_.isPlainObject(value)) {
      acc[key === `elemMatch` ? `$elemMatch` : key] = prepareQueryArgs(value)
    } else {
      switch (key) {
        case `regex`:
          acc[`$regex`] = prepareRegex(value)
          break
        case `glob`:
          acc[`$regex`] = makeRe(value)
          break
        default:
          acc[`$${key}`] = value
      }
    }
    return acc
  }, {})

const getFilters = filters =>
  Object.keys(filters).reduce(
    (acc, key) => acc.push({ [key]: filters[key] }) && acc,
    []
  )

/////////////////////////////////////////////////////////////////////
// Run Sift
/////////////////////////////////////////////////////////////////////

function isEqId(firstOnly, fieldsToSift, siftArgs) {
  return (
    firstOnly &&
    Object.keys(fieldsToSift).length === 1 &&
    Object.keys(fieldsToSift)[0] === `id` &&
    Object.keys(siftArgs[0].id).length === 1 &&
    Object.keys(siftArgs[0].id)[0] === `$eq`
  )
}

function handleFirst(siftArgs, nodes) {
  const index = _.isEmpty(siftArgs)
    ? 0
    : sift.indexOf(
        {
          $and: siftArgs,
        },
        nodes
      )

  if (index !== -1) {
    return [nodes[index]]
  } else {
    return []
  }
}

function handleMany(siftArgs, nodes, sort) {
  let result = _.isEmpty(siftArgs)
    ? nodes
    : sift(
        {
          $and: siftArgs,
        },
        nodes
      )

  if (!result || !result.length) return null

  // Sort results.
  if (sort) {
    // create functions that return the item to compare on
    const sortFields = sort.fields.map(field => v => getValueAt(v, field))
    const sortOrder = sort.order.map(order => order.toLowerCase())

    result = _.orderBy(result, sortFields, sortOrder)
  }
  return result
}

/**
 * Filters a list of nodes using mongodb-like syntax.
 *
 * @param args raw graphql query filter as an object
 * @param nodes The nodes array to run sift over (Optional
 *   will load itself if not present)
 * @param type gqlType. Created in build-node-types
 * @param firstOnly true if you want to return only the first result
 *   found. This will return a collection of size 1. Not a single
 *   element
 * @returns Collection of results. Collection will be limited to size
 *   if `firstOnly` is true
 */
module.exports = (args: Object) => {
  const { getNode, getNodesByType } = require(`../db/nodes`)

  const { queryArgs, gqlType, firstOnly = false, nodeTypeNames } = args

  // If nodes weren't provided, then load them from the DB
  const nodes = args.nodes || getNodesByType(gqlType.name)

  const { filter, sort, group, distinct } = queryArgs
  const siftFilter = getFilters(prepareQueryArgs(filter))
  const fieldsToSift = getQueryFields({ filter, sort, group, distinct })

  // If the the query for single node only has a filter for an "id"
  // using "eq" operator, then we'll just grab that ID and return it.
  if (isEqId(firstOnly, fieldsToSift, siftFilter)) {
    const node = getNode(siftFilter[0].id[`$eq`])

    if (
      !node ||
      (node.internal && !nodeTypeNames.includes(node.internal.type))
    ) {
      return []
    }

    return resolveRecursive(node, fieldsToSift, gqlType.getFields()).then(
      node => (node ? [node] : [])
    )
  }

  return resolveNodes(
    nodes,
    gqlType.name,
    firstOnly,
    fieldsToSift,
    gqlType.getFields()
  ).then(resolvedNodes => {
    if (firstOnly) {
      return handleFirst(siftFilter, resolvedNodes)
    } else {
      return handleMany(siftFilter, resolvedNodes, queryArgs.sort)
    }
  })
}
