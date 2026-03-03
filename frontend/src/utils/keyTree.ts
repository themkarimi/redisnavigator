import type { RedisKey } from '@/types'

export interface NamespaceNode {
  kind: 'namespace'
  /** Full prefix including trailing colon, e.g. "user:" or "user:profile:" */
  prefix: string
  /** Display label (just the local segment), e.g. "user:" or "profile:" */
  label: string
  children: KeyTreeNode[]
  /** Total number of leaf keys nested under this namespace */
  count: number
}

export interface LeafNode {
  kind: 'leaf'
  redisKey: RedisKey
}

export type KeyTreeNode = NamespaceNode | LeafNode

/**
 * Recursively builds a tree of namespace nodes and leaf nodes from a flat list
 * of Redis keys by splitting on the ":" delimiter.
 *
 * e.g.  ["user:123", "user:456", "user:profile:789", "config"]
 * becomes:
 *   namespace "user:" → leaf "user:123", leaf "user:456",
 *                        namespace "user:profile:" → leaf "user:profile:789"
 *   leaf "config"
 */
export function buildKeyTree(keys: RedisKey[]): KeyTreeNode[] {
  return buildSubTree(keys, '')
}

function buildSubTree(keys: RedisKey[], parentPrefix: string): KeyTreeNode[] {
  const leaves: LeafNode[] = []
  const namespaceMap = new Map<string, RedisKey[]>()

  for (const key of keys) {
    const local = key.key.substring(parentPrefix.length)
    const colonIdx = local.indexOf(':')

    if (colonIdx === -1) {
      leaves.push({ kind: 'leaf', redisKey: key })
    } else {
      const localSegment = local.substring(0, colonIdx + 1) // e.g. "user:"
      const fullPrefix = parentPrefix + localSegment        // e.g. "user:" or "user:profile:"
      if (!namespaceMap.has(fullPrefix)) {
        namespaceMap.set(fullPrefix, [])
      }
      namespaceMap.get(fullPrefix)!.push(key)
    }
  }

  const namespaceNodes: NamespaceNode[] = []
  for (const [fullPrefix, prefixKeys] of namespaceMap) {
    const label = fullPrefix.substring(parentPrefix.length) // local segment like "user:"
    const children = buildSubTree(prefixKeys, fullPrefix)
    namespaceNodes.push({
      kind: 'namespace',
      prefix: fullPrefix,
      label,
      children,
      count: countLeaves(children),
    })
  }

  // Sort namespaces alphabetically, then leaves alphabetically
  namespaceNodes.sort((a, b) => a.prefix.localeCompare(b.prefix))
  leaves.sort((a, b) => a.redisKey.key.localeCompare(b.redisKey.key))

  return [...namespaceNodes, ...leaves]
}

function countLeaves(nodes: KeyTreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.kind === 'leaf') {
      count++
    } else {
      count += node.count
    }
  }
  return count
}
