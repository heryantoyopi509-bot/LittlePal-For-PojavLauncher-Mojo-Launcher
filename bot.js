const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const pvp = require('mineflayer-pvp').plugin
const collectBlock = require('mineflayer-collectblock').plugin
const armorManager = require('mineflayer-armor-manager')
const axios = require('axios')

// === CREATE BOT ===
const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'AIBot'
})

// === LOAD PLUGINS ===
bot.loadPlugin(pathfinder)
bot.loadPlugin(pvp)
bot.loadPlugin(collectBlock)
bot.loadPlugin(armorManager)

let autoWalk = true
let currentGuardTarget = null // Nama player yang sedang di-guard

// === SPAWN ===
bot.once('spawn', () => {
  const mcData = require('minecraft-data')(bot.version)
  const movements = new Movements(bot, mcData)
  bot.pathfinder.setMovements(movements)

  console.log('Bot joined the server')

  setInterval(lookAround, 4000)
  setInterval(randomWalk, 8000)
  setInterval(autoEat, 3000)
  setInterval(() => guardLogic(), 1000) // Pakai fungsi guardLogic
})

// === AUTO EAT ===
function autoEat() {
  if (bot.food >= 18) return

  const foodItem = bot.inventory.items().find(i =>
    ['bread','apple','cooked_beef','cooked_chicken','cooked_porkchop','cookie'].some(name => i.name.includes(name))
  )
  
  if (!foodItem) return

  bot.equip(foodItem, 'hand')
    .then(() => bot.consume())
    .then(() => bot.chat(`Eating ${foodItem.name}`))
    .catch(err => console.log('Auto eat failed:', err))
}

// === LOOK AROUND ===
function lookAround() {
  const yaw = Math.random() * Math.PI * 2
  const pitch = (Math.random() - 0.5) * 0.5
  bot.look(yaw, pitch, true)
}

// === RANDOM WALK ===
function randomWalk() {
  if (!autoWalk) return
  const x = bot.entity.position.x + (Math.random() * 10 - 5)
  const z = bot.entity.position.z + (Math.random() * 10 - 5)
  const y = bot.entity.position.y
  bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z))
}

// === CHAT COMMANDS + AI ===
bot.on('chat', async (username, message) => {
  if (username === bot.username) return
  const msg = message.toLowerCase()

  // FOLLOW
  if (msg === 'follow') {
    const player = bot.players[username]
    if (!player?.entity) return bot.chat("I can't see you")
    bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 2), true)
    return bot.chat('Ok, I am following')
  }

  // STOP
  if (msg === 'stop') {
    bot.pathfinder.setGoal(null)
    bot.pvp.stop()
    autoWalk = false
    return bot.chat('Stopping all actions')
  }

  // WALK
  if (msg === 'walk') {
    autoWalk = true
    return bot.chat('Walking randomly')
  }

  // COLLECT BLOCKS
  if (msg.startsWith('collect ')) {
    const args = message.split(' ')
    const blockName = args[1]
    const amount = parseInt(args[2]) || 1
    let collected = 0
    bot.chat(`Collecting ${amount} ${blockName}`)

    while (collected < amount) {
      const block = bot.findBlock({
        matching: b => b.name.includes(blockName),
        maxDistance: 32
      })

      if (!block) {
        bot.chat('No more blocks found')
        break
      }

      try {
        await bot.collectBlock.collect(block)
        collected++
      } catch {
        bot.chat('Failed to collect')
        break
      }
    }

    return bot.chat(`Finished collecting ${collected}`)
  }

  // GUARD PLAYER
  if (msg.startsWith('guard ')) {
    const args = message.split(' ')
    currentGuardTarget = args[1] // Simpan nama player
    return bot.chat(`I will guard ${currentGuardTarget}`)
  }

  if (msg === 'stopguard') {
    currentGuardTarget = null
    return bot.chat('Stopping guard mode')
  }

  // === AI CHAT LANGSUNG ===
  try {
    const res = await axios.post('http://localhost:11434/api/generate', {
      model: 'qwen2:0.5b',
      prompt: 'Answer briefly as a Minecraft player: ' + message,
      stream: false,
      options: { num_predict: 20 }
    })

    let reply = res.data.response.replace(/\n/g, ' ').slice(0, 80)
    setTimeout(() => bot.chat(reply), 500)
  } catch {
    bot.chat('AI error')
  }
})

// === GUARD LOGIC ===
function guardLogic() {
  if (!currentGuardTarget) return

  const player = bot.players[currentGuardTarget]?.entity
  if (!player) return

  const mob = bot.nearestEntity(e => 
    (e.type === 'mob' || e.type === 'hostile') && 
    e.position.distanceTo(player.position) < 10
  )

  if (mob) {
    autoWalk = false
    bot.pvp.attack(mob)
  } else {
    const distance = bot.entity.position.distanceTo(player.position)
    if (distance > 3) {
      bot.pathfinder.setGoal(new goals.GoalFollow(player, 2), true)
    }
  }
}
