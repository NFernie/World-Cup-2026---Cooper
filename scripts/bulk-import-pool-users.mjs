#!/usr/bin/env node
/**
 * Bulk-create WC26 auth users from a CSV and add them to a pool.
 *
 * CSV format: Name,Password
 * - pool_members.display_name = Name (full name)
 * - auth password = Password column
 * - login username derived from Password (surname), with collision suffixes
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/bulk-import-pool-users.mjs \
 *     --csv path/to/users.csv \
 *     --pool "Santos 2026 WC Sweep 1 $10-" \
 *     [--dry-run]
 *
 * Requires service role key (never commit or expose in the browser).
 */

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../web/package.json'))
const { createClient } = require('@supabase/supabase-js')

const AUTH_DOMAIN = 'wc26.auth.local'

function parseArgs(argv) {
  const args = { dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--csv') args.csv = argv[++i]
    else if (a === '--pool') args.pool = argv[++i]
    else throw new Error(`Unknown arg: ${a}`)
  }
  if (!args.csv || !args.pool) {
    throw new Error('Required: --csv <file> --pool <exact pool name>')
  }
  return args
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0]?.toLowerCase()
  if (!header?.startsWith('name')) {
    throw new Error('CSV must start with header: Name,Password')
  }
  return lines.slice(1).filter(Boolean).map((line) => {
    const comma = line.indexOf(',')
    if (comma < 0) throw new Error(`Invalid CSV line: ${line}`)
    const name = line.slice(0, comma).trim().replace(/\r$/, '')
    const password = line.slice(comma + 1).trim().replace(/\r$/, '')
    return { name, password }
  })
}

function sanitizeUsername(raw) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

function surnameFromPassword(password) {
  const s = sanitizeUsername(password)
  return s.endsWith('2026') ? s.slice(0, -4) : s
}

function deriveUsername(name, password, used) {
  const parts = name.split(/\s+/).filter(Boolean)
  const first = sanitizeUsername(parts[0] ?? 'user')
  const last = sanitizeUsername(parts[parts.length - 1] ?? 'user')

  const candidates = []
  if (password) candidates.push(surnameFromPassword(password))
  candidates.push(last, `${first}_${last}`, `${first}${last}`, `${last}_${first}`)

  for (const base of candidates) {
    if (!base || base.length < 3) continue
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    for (let n = 2; n <= 99; n++) {
      const suffixed = `${base}${n}`.slice(0, 20)
      if (suffixed.length >= 3 && !used.has(suffixed)) {
        used.add(suffixed)
        return suffixed
      }
    }
  }

  throw new Error(`Could not derive username for ${name}`)
}

async function main() {
  const args = parseArgs(process.argv)
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const csvPath = resolve(args.csv)
  const rows = parseCsv(readFileSync(csvPath, 'utf8'))
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .select('id, name, team_assignment_mode, join_locked')
    .eq('name', args.pool)
    .maybeSingle()

  if (poolError) throw poolError
  if (!pool) {
    throw new Error(`Pool not found with exact name: "${args.pool}"`)
  }

  const { count: memberCount } = await supabase
    .from('pool_members')
    .select('id', { count: 'exact', head: true })
    .eq('pool_id', pool.id)

  console.log(`Pool: ${pool.name} (${pool.id})`)
  console.log(`Members now: ${memberCount ?? 0}, importing: ${rows.length}`)
  if (pool.join_locked && (memberCount ?? 0) + rows.length > 48) {
    console.warn('WARNING: join_locked is on and total may exceed 48 — later joins may need host action.')
  }

  const usedUsernames = new Set()
  const plan = rows.map((row) => {
    const username = deriveUsername(row.name, row.password, usedUsernames)
    return {
      ...row,
      username,
      email: `${username}@${AUTH_DOMAIN}`,
    }
  })

  const shortPasswords = plan.filter((p) => !p.password || p.password.length < 6)
  if (shortPasswords.length > 0) {
    console.warn(`\nWARNING: ${shortPasswords.length} row(s) have password < 6 chars (Supabase minimum):`)
    for (const p of shortPasswords) {
      console.warn(`  - ${p.name}: "${p.password}" (${p.password.length} chars)`)
    }
    console.warn('These users will fail auth creation unless min password length is lowered in Supabase.\n')
  }

  if (args.dryRun) {
    console.log('\nDry run — planned imports:')
    for (const p of plan) {
      console.log(`  ${p.username} | ${p.name} | pw len ${p.password.length}`)
    }
    return
  }

  const results = { created: 0, joined: 0, skipped: 0, failed: [] }

  for (const entry of plan) {
    try {
      if (!entry.password || entry.password.length < 6) {
        results.failed.push({ name: entry.name, reason: 'Password under 6 characters' })
        continue
      }

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', entry.username)
        .maybeSingle()

      let userId = existingProfile?.id

      if (!userId) {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email: entry.email,
          password: entry.password,
          email_confirm: true,
          user_metadata: { username: entry.username },
        })
        if (createError) {
          results.failed.push({ name: entry.name, reason: createError.message })
          continue
        }
        userId = created.user.id
        results.created++

        await supabase.from('profiles').upsert({
          id: userId,
          email: entry.email,
          username: entry.username,
        })
      } else {
        results.skipped++
      }

      const { data: alreadyMember } = await supabase
        .from('pool_members')
        .select('id')
        .eq('pool_id', pool.id)
        .eq('user_id', userId)
        .maybeSingle()

      if (alreadyMember) {
        console.log(`Already in pool: ${entry.name}`)
        continue
      }

      const { data: maxOrder } = await supabase
        .from('pool_members')
        .select('join_order')
        .eq('pool_id', pool.id)
        .order('join_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const joinOrder = (maxOrder?.join_order ?? 0) + 1
      const assignmentRound = Math.floor((joinOrder - 1) / 48)

      let assignedTeamId = null
      if (pool.team_assignment_mode === 'automatic') {
        const { data: teamId, error: assignError } = await supabase.rpc(
          'assign_team_for_pool_member',
          { p_pool_id: pool.id },
        )
        if (assignError) throw assignError
        assignedTeamId = teamId
      }

      const { error: memberError } = await supabase.from('pool_members').insert({
        pool_id: pool.id,
        user_id: userId,
        display_name: entry.name,
        assigned_team_id: assignedTeamId,
        join_order: joinOrder,
        assignment_round: assignmentRound,
      })

      if (memberError) {
        results.failed.push({ name: entry.name, reason: memberError.message })
        continue
      }

      results.joined++
      console.log(`OK: ${entry.name} → @${entry.username}`)
    } catch (err) {
      results.failed.push({ name: entry.name, reason: err.message })
    }
  }

  console.log('\nDone:', results)
  if (results.failed.length) {
    console.log('Failures:')
    for (const f of results.failed) console.log(`  - ${f.name}: ${f.reason}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
