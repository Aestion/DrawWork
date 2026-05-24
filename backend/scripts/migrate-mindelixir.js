/**
 * One-time migration script: convert all mindelixir canvases to mindmap.
 *
 * Usage: node scripts/migrate-mindelixir.js
 *
 * What it does:
 *   1. Finds all canvases with type = 'mindelixir' and is_deleted = false
 *   2. For each canvas:
 *      - Creates a mind_maps row with a default root node if none exists
 *      - Changes canvas type to 'mindmap'
 *   3. Prints summary
 *
 * Rollback: SELECT id, name FROM canvases WHERE type = 'mindmap'
 *           AND id IN (<migrated_ids>) → set type back to 'mindelixir'
 *           and DELETE FROM mind_maps WHERE canvas_id IN (<migrated_ids>)
 */

const { sequelize } = require('../src/config/database')
const { Canvas, MindMap } = require('../src/models')

async function migrateMindElixir() {
  console.log('=== MindElixir → MindMap Migration ===\n')

  const mindelixirCanvases = await Canvas.findAll({
    where: { type: 'mindelixir', is_deleted: false }
  })

  console.log(`Found ${mindelixirCanvases.length} mindelixir canvas(es) to migrate.\n`)

  if (mindelixirCanvases.length === 0) {
    console.log('Nothing to migrate.')
    await sequelize.close()
    return
  }

  const results = { succeeded: 0, skipped: 0, failed: 0 }

  for (const canvas of mindelixirCanvases) {
    try {
      // Ensure a mind_maps row exists
      const existing = await MindMap.findOne({ where: { canvas_id: canvas.id } })
      if (!existing) {
        await MindMap.create({
          canvas_id: canvas.id,
          roots: [
            {
              id: `root-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              text: '中心主题',
              children: []
            }
          ],
          cross_connections: [],
          layout: 'horizontal'
        })
        console.log(`  [CREATE] mind_maps for canvas ${canvas.id} (${canvas.name})`)
      } else {
        results.skipped++
        console.log(`  [SKIP]   mind_maps already exists for canvas ${canvas.id} (${canvas.name})`)
      }

      // Change type
      canvas.type = 'mindmap'
      await canvas.save()
      results.succeeded++
      console.log(`  [OK]     ${canvas.id} (${canvas.name}) → mindmap`)
    } catch (err) {
      results.failed++
      console.error(`  [FAIL]   ${canvas.id} (${canvas.name}): ${err.message}`)
    }
  }

  console.log(`\n--- Migration Summary ---`)
  console.log(`  Succeeded: ${results.succeeded}`)
  console.log(`  Skipped:   ${results.skipped}`)
  console.log(`  Failed:    ${results.failed}`)

  await sequelize.close()
}

migrateMindElixir().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
