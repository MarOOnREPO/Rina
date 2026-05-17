<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { setupApi } from '$lib/utils/api';
  import bcrypt from 'bcryptjs';

  // ─── Step Definitions ──────────────────────────────────────────
  type Step = {
    id: string;
    number: number;
    title: string;
    emoji: string;
    description: string;
    commands?: string;
    note?: string;
    action?: 'form' | 'ssl' | 'deploy' | 'backup' | 'verify' | 'info';
  };

  const steps: Step[] = [
    {
      id: 'server-prep',
      number: 1,
      title: 'Server Prep',
      emoji: '🖥️',
      description: 'SSH into Lightsail, update system, install Docker.',
      action: 'info',
      commands: `sudo apt update && sudo apt upgrade -y

# Ensure Docker & Compose are installed
docker --version
docker compose version

# Create project directory
mkdir -p ~/rina && cd ~/rina`,
      note: 'Ubuntu 22.04+ recommended. Minimum 1 vCPU / 2GB RAM.'
    },
    {
      id: 'get-code',
      number: 2,
      title: 'Get the Code',
      emoji: '📥',
      description: 'Push to main (CI deploys) or rsync manually.',
      action: 'info',
      commands: `# Option A: GitHub Actions
# Push to main → workflow rsyncs to /home/ubuntu/rina

# Option B: Manual rsync
rsync -avz --exclude='node_modules' --exclude='.git' ./ ubuntu@YOUR_IP:~/rina`,
      note: 'The CI workflow already builds frontend/build and syncs it.'
    },
    {
      id: 'configure-env',
      number: 3,
      title: 'Configure Environment',
      emoji: '⚙️',
      description: 'Fill every field below. The app will not start without them.',
      action: 'form',
      note: 'Click Generate buttons where available. All fields are required.'
    },
    {
      id: 'init-ssl',
      number: 4,
      title: 'Initialize SSL',
      emoji: '🔒',
      description: 'Get a Let\'s Encrypt certificate for HTTPS.',
      action: 'ssl',
      commands: `./scripts/init-ssl.sh your-domain.com your-email@example.com`,
      note: 'This temporarily starts HTTP nginx, runs Certbot, then enables HTTPS.'
    },
    {
      id: 'deploy',
      number: 5,
      title: 'Deploy the App',
      emoji: '🚀',
      description: 'Start Postgres, run migrations, build & launch all services.',
      action: 'deploy',
      commands: `./scripts/deploy.sh`,
      note: 'Takes 2-3 minutes on first run. Migrations run automatically before backend starts.'
    },
    {
      id: 'verify',
      number: 6,
      title: 'Verify Deployment',
      emoji: '✅',
      description: 'Confirm all services are healthy and responding.',
      action: 'verify',
      commands: `https://your-domain.com
https://your-domain.com/api/health
https://your-domain.com/setup`,
      note: 'Run the health check below to verify DB, Redis, and S3 connectivity.'
    },
    {
      id: 'backups',
      number: 7,
      title: 'Enable Backups',
      emoji: '💾',
      description: 'Test the backup script, then schedule nightly dumps to S3.',
      action: 'backup',
      commands: `# Test once manually
./scripts/backup-db.sh

# Add to crontab for nightly backups
crontab -e
0 3 * * * /home/ubuntu/rina/scripts/backup-db.sh >> /home/ubuntu/rina/backups/backup.log 2>&1`,
      note: 'Backups are uploaded to your S3 bucket under /backups/.'
    },
    {
      id: 'firewall',
      number: 8,
      title: 'Firewall & Ports',
      emoji: '🛡️',
      description: 'Open only the ports you need. Lock everything else.',
      action: 'info',
      commands: `sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable`,
      note: 'See the Ports Reference card above for the full port table.'
    }
  ];

  // ─── Form State ────────────────────────────────────────────────
  let envForm = $state<Record<string, string>>({
    DOMAIN: '',
    POSTGRES_PASSWORD: '',
    JWT_SECRET: '',
    COOKIE_SECRET: '',
    CORS_ORIGIN: '',
    REDIS_URL: 'redis://redis:6379',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: '',
    AWS_SECRET_ACCESS_KEY: '',
    S3_BUCKET_NAME: 'rina-uploads',
    MAROON_PASSWORD_HASH: '',
    RINA_PASSWORD_HASH: '',
    TMDB_API_KEY: '',
    VITE_MAPBOX_TOKEN: '',
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    COTURN_REALM: '',
    COTURN_SECRET: '',
    NODE_ENV: 'production',
    PORT: '3000'
  });

  let plainMaroonPw = $state('');
  let plainRinaPw = $state('');
  let envLoaded = $state(false);
  let saving = $state(false);
  let saveMsg = $state('');

  // ─── Wizard State ──────────────────────────────────────────────
  let completed = $state<Set<string>>(new Set());
  let expanded = $state<string | null>('configure-env');
  let status = $state<any>(null);
  let checking = $state(false);
  let runningStep = $state<string | null>(null);
  let consoleOutput = $state<string>('');
  let copiedId = $state<string | null>(null);

  let sslDomain = $state('');
  let sslEmail = $state('');

  // ─── Persistence ───────────────────────────────────────────────
  onMount(() => {
    const raw = localStorage.getItem('rina-setup-steps');
    if (raw) {
      try { completed = new Set(JSON.parse(raw)); } catch { completed = new Set(); }
    }
    loadEnv();
    runVerify();
  });

  $effect(() => {
    localStorage.setItem('rina-setup-steps', JSON.stringify([...completed]));
  });

  // ─── Actions ───────────────────────────────────────────────────
  async function loadEnv() {
    try {
      const data = await setupApi.getEnv();
      if (data.exists) {
        envForm = { ...envForm, ...data.env };
        envLoaded = true;
      }
    } catch { /* ignore */ }
  }

  async function saveEnv() {
    saving = true;
    saveMsg = '';
    try {
      const res = await setupApi.saveEnv(envForm);
      saveMsg = res.message || 'Saved!';
      envLoaded = true;
    } catch (err: any) {
      saveMsg = err.message || 'Failed to save';
    } finally {
      saving = false;
    }
  }

  function toggleStep(id: string) {
    if (completed.has(id)) completed.delete(id);
    else completed.add(id);
    completed = new Set(completed);
  }

  function toggleExpand(id: string) {
    expanded = expanded === id ? null : id;
  }

  async function copyCommands(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    copiedId = id;
    setTimeout(() => (copiedId = null), 1500);
  }

  function appendConsole(text: string) {
    consoleOutput += '\n' + text;
    setTimeout(() => {
      const el = document.getElementById('setup-console');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  async function runStepAction(step: Step) {
    if (step.action === 'ssl') {
      if (!sslDomain || !sslEmail) {
        appendConsole('❌ Please enter Domain and Email.');
        return;
      }
      runningStep = step.id;
      appendConsole(`🔒 Running SSL initialization for ${sslDomain}...`);
      try {
        const res = await setupApi.runSSL(sslDomain, sslEmail);
        appendConsole(res.output || res.message || 'Done');
        if (res.success) toggleStep(step.id);
      } catch (err: any) {
        appendConsole(`❌ Error: ${err.message || err}`);
      } finally { runningStep = null; }
    }

    if (step.action === 'deploy') {
      runningStep = step.id;
      appendConsole('🚀 Running deploy.sh... (this may take 2-3 minutes)');
      try {
        const res = await setupApi.runDeploy();
        appendConsole(res.output || res.message || 'Done');
        if (res.success) toggleStep(step.id);
      } catch (err: any) {
        appendConsole(`❌ Error: ${err.message || err}`);
      } finally { runningStep = null; }
    }

    if (step.action === 'backup') {
      runningStep = step.id;
      appendConsole('💾 Running backup test...');
      try {
        const res = await setupApi.runBackup();
        appendConsole(res.output || res.message || 'Done');
        if (res.success) toggleStep(step.id);
      } catch (err: any) {
        appendConsole(`❌ Error: ${err.message || err}`);
      } finally { runningStep = null; }
    }

    if (step.action === 'verify') {
      await runVerify();
      if (status?.healthy) toggleStep(step.id);
    }
  }

  async function runVerify() {
    checking = true;
    try {
      status = await setupApi.status();
      appendConsole(`🔍 Env=${status.checks.env} DB=${status.checks.database} Redis=${status.checks.redis} S3=${status.checks.s3}`);
    } catch (err: any) {
      status = null;
      appendConsole(`❌ Health check failed: ${err.message || err}`);
    } finally { checking = false; }
  }

  function generateSecret() {
    const arr = new Uint8Array(48);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
  }

  async function generateHash(user: 'maroon' | 'rina') {
    const pw = user === 'maroon' ? plainMaroonPw : plainRinaPw;
    if (!pw) {
      saveMsg = `Enter ${user} password first`;
      return;
    }
    const hash = await bcrypt.hash(pw, 12);
    if (user === 'maroon') envForm.MAROON_PASSWORD_HASH = hash;
    else envForm.RINA_PASSWORD_HASH = hash;
    saveMsg = `${user} hash generated!`;
  }

  async function generateVapid() {
    try {
      const res = await setupApi.generateVapid();
      envForm.VAPID_PUBLIC_KEY = res.publicKey;
      envForm.VAPID_PRIVATE_KEY = res.privateKey;
      saveMsg = 'VAPID keys generated!';
    } catch (err: any) {
      saveMsg = err.message || 'Failed to generate VAPID';
    }
  }

  const progressPercent = $derived(Math.round((completed.size / steps.length) * 100));
  const allDone = $derived(completed.size === steps.length);
</script>

<svelte:head>
  <title>Setup Wizard — Rina</title>
</svelte:head>

<div class="min-h-screen relative overflow-hidden px-4 py-8 md:py-12">
  <!-- Ambient glows -->
  <div class="fixed top-0 left-1/4 w-[500px] h-[500px] bg-rina-rose/10 rounded-full blur-[140px] pointer-events-none"></div>
  <div class="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-rina-indigo/10 rounded-full blur-[140px] pointer-events-none"></div>

  <div class="max-w-5xl mx-auto relative z-10">
    <!-- Header -->
    <div class="text-center mb-8" in:fly={{ y: -20, duration: 500 }}>
      <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rina-rose/10 border border-rina-rose/20 text-rina-rose text-xs font-semibold mb-4">
        🚀 Complete Deployment Wizard
      </div>
      <h1 class="text-4xl md:text-5xl font-bold text-gradient mb-3">Setup Rina</h1>
      <p class="text-rina-slate text-sm md:text-base max-w-2xl mx-auto">
        From A to Z: configure, deploy, and verify your private sanctuary on AWS Lightsail — all from this page.
      </p>
    </div>

    <!-- Ports Reference Card -->
    <div class="glass-strong rounded-2xl p-5 mb-6 border border-rina-border/50" in:fly={{ y: 20, duration: 400, delay: 80 }}>
      <div class="flex items-center gap-2 mb-4">
        <span class="text-xl">🌐</span>
        <h2 class="text-sm font-semibold">Lightsail Ports Reference</h2>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div class="bg-rina-bg/60 rounded-lg p-3 border border-emerald-500/20">
          <div class="text-emerald-400 font-bold text-lg">22</div>
          <div class="text-rina-slate">TCP — SSH</div>
        </div>
        <div class="bg-rina-bg/60 rounded-lg p-3 border border-emerald-500/20">
          <div class="text-emerald-400 font-bold text-lg">80</div>
          <div class="text-rina-slate">TCP — HTTP</div>
        </div>
        <div class="bg-rina-bg/60 rounded-lg p-3 border border-emerald-500/20">
          <div class="text-emerald-400 font-bold text-lg">443</div>
          <div class="text-rina-slate">TCP — HTTPS</div>
        </div>
        <div class="bg-rina-bg/60 rounded-lg p-3 border border-amber-500/20">
          <div class="text-amber-400 font-bold text-lg">3478</div>
          <div class="text-rina-slate">UDP/TCP — Coturn</div>
        </div>
        <div class="bg-rina-bg/60 rounded-lg p-3 border border-amber-500/20">
          <div class="text-amber-400 font-bold text-lg">5349</div>
          <div class="text-rina-slate">UDP/TCP — Coturn TLS</div>
        </div>
        <div class="bg-rina-bg/60 rounded-lg p-3 border border-amber-500/20">
          <div class="text-amber-400 font-bold text-lg">49152-65535</div>
          <div class="text-rina-slate">UDP — Coturn Media</div>
        </div>
        <div class="bg-rose-500/10 rounded-lg p-3 border border-rose-500/20 md:col-span-2">
          <div class="text-rose-400 font-bold">❌ DO NOT OPEN</div>
          <div class="text-rina-slate">3000 (backend) · 9000/9001 (old MinIO)</div>
        </div>
      </div>
      <p class="text-[10px] text-rina-slate-dark mt-3">
        Open these in your Lightsail instance dashboard under <strong>Networking → Firewall</strong>.
      </p>
    </div>

    <!-- Progress -->
    <div class="glass-strong rounded-2xl p-5 mb-8 shadow-2xl" in:fly={{ y: 20, duration: 400, delay: 120 }}>
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-rina-slate">Setup Progress</span>
        <span class="text-sm font-bold {allDone ? 'text-emerald-400' : 'text-white'}">{completed.size} / {steps.length}</span>
      </div>
      <div class="w-full h-2.5 bg-rina-bg rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-rina-rose to-rina-indigo" style="width: {progressPercent}%"></div>
      </div>
      {#if allDone}<div class="mt-3 text-center text-emerald-400 text-sm font-medium" in:fade>🎉 Setup complete!</div>{/if}
    </div>

    <!-- Steps -->
    <div class="space-y-4">
      {#each steps as step, i (step.id)}
        <div in:fly={{ y: 20, duration: 400, delay: 150 + i * 60 }}>
          <div class="glass-strong rounded-2xl overflow-hidden border {completed.has(step.id) ? 'border-emerald-500/30' : 'border-rina-border'} transition-all">
            <!-- Header -->
            <button class="w-full flex items-center gap-4 p-4 md:p-5 text-left hover:bg-white/[0.02] transition-colors" onclick={() => toggleExpand(step.id)}>
              <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 shrink-0 transition-all {completed.has(step.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-rina-bg border-rina-border'}">
                {completed.has(step.id) ? '✓' : step.number}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-lg">{step.emoji}</span>
                  <h3 class="font-semibold text-white truncate">{step.title}</h3>
                </div>
                <p class="text-rina-slate text-xs mt-0.5 truncate">{step.description}</p>
              </div>
              <div class="text-rina-slate transition-transform duration-300 {expanded === step.id ? 'rotate-180' : ''}">▼</div>
            </button>

            {#if expanded === step.id}
              <div class="px-4 md:px-5 pb-5" transition:slide={{ duration: 300 }}>

                {#if step.action === 'form'}
                  <!-- Domain -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">🔗 Domain & DNS</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">Domain Name</label>
                        <input bind:value={envForm.DOMAIN} placeholder="rina.example.com" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                        <p class="text-[10px] text-rina-slate-dark mt-1">Point an A-record to your Lightsail static IP.</p>
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">CORS Origin</label>
                        <input bind:value={envForm.CORS_ORIGIN} placeholder="https://rina.example.com" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                        <p class="text-[10px] text-rina-slate-dark mt-1">Must match your HTTPS domain exactly.</p>
                      </div>
                    </div>
                  </div>

                  <!-- Database -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">🐘 Database</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">Postgres Password</label>
                        <div class="flex gap-2">
                          <input type="password" bind:value={envForm.POSTGRES_PASSWORD} placeholder="openssl rand -hex 32" class="flex-1 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                          <button onclick={() => envForm.POSTGRES_PASSWORD = generateSecret().slice(0, 32)} class="px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-[10px] hover:border-rina-rose/50 transition-colors">Gen</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Auth -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">🔐 Authentication</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">JWT Secret</label>
                        <div class="flex gap-2">
                          <input type="password" bind:value={envForm.JWT_SECRET} placeholder="64+ random chars" class="flex-1 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                          <button onclick={() => envForm.JWT_SECRET = generateSecret()} class="px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-[10px] hover:border-rina-rose/50 transition-colors">Gen</button>
                        </div>
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">Cookie Secret</label>
                        <div class="flex gap-2">
                          <input type="password" bind:value={envForm.COOKIE_SECRET} placeholder="Different from JWT" class="flex-1 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                          <button onclick={() => envForm.COOKIE_SECRET = generateSecret()} class="px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-[10px] hover:border-rina-rose/50 transition-colors">Gen</button>
                        </div>
                      </div>
                      <div class="md:col-span-2">
                        <label class="text-[11px] text-rina-slate mb-1 block">Maroon Password → Bcrypt Hash</label>
                        <div class="flex gap-2">
                          <input type="password" bind:value={plainMaroonPw} placeholder="Type password" class="flex-1 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                          <button onclick={() => generateHash('maroon')} class="px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-[10px] hover:border-rina-rose/50 transition-colors">Hash</button>
                        </div>
                        <input type="text" bind:value={envForm.MAROON_PASSWORD_HASH} placeholder="$2a$12$..." class="w-full mt-2 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div class="md:col-span-2">
                        <label class="text-[11px] text-rina-slate mb-1 block">Rina Password → Bcrypt Hash</label>
                        <div class="flex gap-2">
                          <input type="password" bind:value={plainRinaPw} placeholder="Type password" class="flex-1 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                          <button onclick={() => generateHash('rina')} class="px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-[10px] hover:border-rina-rose/50 transition-colors">Hash</button>
                        </div>
                        <input type="text" bind:value={envForm.RINA_PASSWORD_HASH} placeholder="$2a$12$..." class="w-full mt-2 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                    </div>
                  </div>

                  <!-- AWS S3 -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">☁️ AWS S3 Storage</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">AWS Region</label>
                        <input bind:value={envForm.AWS_REGION} placeholder="us-east-1" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">S3 Bucket Name</label>
                        <input bind:value={envForm.S3_BUCKET_NAME} placeholder="rina-uploads" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">AWS Access Key ID</label>
                        <input bind:value={envForm.AWS_ACCESS_KEY_ID} placeholder="AKIA..." class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">AWS Secret Access Key</label>
                        <input type="password" bind:value={envForm.AWS_SECRET_ACCESS_KEY} placeholder="your-secret" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                    </div>
                    <p class="text-[10px] text-rina-slate-dark mt-3">
                      Create an IAM user with programmatic access and attach this inline policy:
                    </p>
                    <pre class="mt-1 bg-black/30 rounded-lg p-2 text-[10px] font-mono text-rina-slate overflow-x-auto">{'{\\n  "Version": "2012-10-17",\\n  "Statement": [\\n    {\\n      "Effect": "Allow",\\n      "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject"],\\n      "Resource": "arn:aws:s3:::'}{envForm.S3_BUCKET_NAME || 'your-bucket'}{'/*"\\n    }\\n  ]\\n}'}</pre>
                  </div>

                  <!-- External APIs -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">🎬 External APIs</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">TMDB API Key</label>
                        <input bind:value={envForm.TMDB_API_KEY} placeholder="optional" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                        <a href="https://www.themoviedb.org/settings/api" target="_blank" class="text-[10px] text-rina-rose hover:underline">Get free key →</a>
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">Mapbox Token</label>
                        <input bind:value={envForm.VITE_MAPBOX_TOKEN} placeholder="optional" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                        <a href="https://account.mapbox.com/access-tokens/" target="_blank" class="text-[10px] text-rina-rose hover:underline">Get token →</a>
                      </div>
                    </div>
                  </div>

                  <!-- Web Push -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">🔔 Web Push (VAPID)</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">VAPID Public Key</label>
                        <input bind:value={envForm.VAPID_PUBLIC_KEY} placeholder="..." class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">VAPID Private Key</label>
                        <input type="password" bind:value={envForm.VAPID_PRIVATE_KEY} placeholder="..." class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                    </div>
                    <button onclick={generateVapid} class="mt-3 px-4 py-2 rounded-xl bg-rina-bg border border-rina-border text-xs hover:border-rina-rose/50 transition-colors">
                      🔑 Generate VAPID Keys
                    </button>
                  </div>

                  <!-- Coturn -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">📡 Coturn TURN Server (WebRTC)</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">Coturn Realm</label>
                        <input bind:value={envForm.COTURN_REALM} placeholder="your-domain.com" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">Coturn Secret</label>
                        <div class="flex gap-2">
                          <input type="password" bind:value={envForm.COTURN_SECRET} placeholder="random hex" class="flex-1 px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                          <button onclick={() => envForm.COTURN_SECRET = generateSecret().slice(0, 32)} class="px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-[10px] hover:border-rina-rose/50 transition-colors">Gen</button>
                        </div>
                      </div>
                    </div>
                    <p class="text-[10px] text-rina-slate-dark mt-2">
                      For production, run Coturn on a <strong>separate Lightsail instance</strong> with the UDP ports open (see reference card above).
                    </p>
                  </div>

                  <!-- System -->
                  <div class="mt-3 p-4 bg-rina-bg/40 rounded-xl border border-rina-border/40">
                    <h4 class="text-xs font-bold text-rina-slate uppercase tracking-wider mb-3">⚙️ System</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">NODE_ENV</label>
                        <input bind:value={envForm.NODE_ENV} placeholder="production" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">PORT</label>
                        <input bind:value={envForm.PORT} placeholder="3000" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                      <div>
                        <label class="text-[11px] text-rina-slate mb-1 block">Redis URL</label>
                        <input bind:value={envForm.REDIS_URL} placeholder="redis://redis:6379" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                      </div>
                    </div>
                  </div>

                  <!-- Save Buttons -->
                  <div class="mt-5 flex items-center gap-3 sticky bottom-4 z-20">
                    <button onclick={saveEnv} disabled={saving} class="px-6 py-3 rounded-xl bg-gradient-to-r from-rina-rose to-rina-indigo text-white text-sm font-bold shadow-lg hover:opacity-90 transition-all disabled:opacity-50">
                      {saving ? '⏳ Saving...' : '💾 Save .env Configuration'}
                    </button>
                    <button onclick={loadEnv} class="px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-rina-slate text-sm hover:border-rina-rose/50 transition-all">
                      🔄 Reload
                    </button>
                    {#if saveMsg}
                      <span class="text-xs {saveMsg.includes('Failed') || saveMsg.includes('Error') ? 'text-rose-400' : 'text-emerald-400'} font-medium" in:fade>{saveMsg}</span>
                    {/if}
                  </div>
                {/if}

                <!-- SSL Inputs -->
                {#if step.action === 'ssl'}
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div>
                      <label class="text-xs text-rina-slate font-medium mb-1 block">Domain</label>
                      <input bind:value={sslDomain} placeholder="rina.example.com" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                    </div>
                    <div>
                      <label class="text-xs text-rina-slate font-medium mb-1 block">Email</label>
                      <input bind:value={sslEmail} placeholder="admin@example.com" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                    </div>
                  </div>
                {/if}

                <!-- Commands -->
                {#if step.commands && step.action !== 'form'}
                  <div class="relative mt-3">
                    <div class="bg-rina-bg rounded-xl p-4 overflow-x-auto border border-rina-border/50">
                      <pre class="text-xs font-mono text-rina-slate leading-relaxed whitespace-pre">{step.commands}</pre>
                    </div>
                    <button onclick={() => copyCommands(step.commands!, step.id)} class="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-rina-bg border border-rina-border text-[10px] font-medium hover:border-rina-rose/50 hover:text-rina-rose transition-colors">
                      {copiedId === step.id ? '✅ Copied' : '📋 Copy'}
                    </button>
                  </div>
                {/if}

                {#if step.note}
                  <div class="mt-3 flex items-start gap-2 text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <span class="mt-0.5">💡</span>
                    <span>{step.note}</span>
                  </div>
                {/if}

                <!-- Action Buttons -->
                {#if step.action && step.action !== 'info' && step.action !== 'form'}
                  <div class="mt-4 flex items-center gap-3">
                    <button
                      onclick={() => runStepAction(step)}
                      disabled={runningStep === step.id || (step.action === 'ssl' && (!sslDomain || !sslEmail))}
                      class="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border {step.action === 'deploy' ? 'bg-gradient-to-r from-rina-rose to-rina-indigo text-white border-transparent hover:opacity-90' : 'bg-rina-bg text-rina-slate border-rina-border hover:border-rina-rose/50'} disabled:opacity-50"
                    >
                      {#if runningStep === step.id}
                        ⏳ Running...
                      {:else if step.action === 'ssl'}
                        🔒 Run SSL Setup
                      {:else if step.action === 'deploy'}
                        🚀 Run Deploy
                      {:else if step.action === 'backup'}
                        💾 Test Backup
                      {:else if step.action === 'verify'}
                        🔍 Run Health Check
                      {/if}
                    </button>
                    <button
                      onclick={() => toggleStep(step.id)}
                      class="px-4 py-2.5 rounded-xl text-sm font-medium transition-all border {completed.has(step.id) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rina-bg text-rina-slate border-rina-border hover:border-rina-rose/50'}"
                    >
                      {completed.has(step.id) ? '✓ Done' : 'Mark as Done'}
                    </button>
                  </div>
                {:else if step.action === 'info'}
                  <div class="mt-4">
                    <button
                      onclick={() => toggleStep(step.id)}
                      class="px-4 py-2 rounded-xl text-sm font-medium transition-all border {completed.has(step.id) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rina-bg text-rina-slate border-rina-border hover:border-rina-rose/50'}"
                    >
                      {completed.has(step.id) ? '✓ Done' : 'Mark as Done'}
                    </button>
                  </div>
                {:else if step.action === 'form'}
                  <div class="mt-4">
                    <button
                      onclick={() => toggleStep(step.id)}
                      disabled={!envLoaded}
                      class="px-4 py-2 rounded-xl text-sm font-medium transition-all border {completed.has(step.id) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rina-bg text-rina-slate border-rina-border hover:border-rina-rose/50'} disabled:opacity-50"
                    >
                      {completed.has(step.id) ? '✓ Configuration Saved' : 'Mark as Done'}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Console Output -->
    <div class="glass-strong rounded-2xl p-5 mt-8 border border-rina-border/50" in:fly={{ y: 20, duration: 400, delay: 600 }}>
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-lg">🖥️</span>
          <h2 class="text-sm font-semibold">Console Output</h2>
        </div>
        <button onclick={() => (consoleOutput = '')} class="text-[10px] text-rina-slate hover:text-white transition-colors">Clear</button>
      </div>
      <div id="setup-console" class="bg-black/40 rounded-xl p-4 h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-rina-slate whitespace-pre-wrap border border-rina-border/30">
        {#if consoleOutput}
          {consoleOutput}
        {:else}
          <span class="text-rina-slate-dark italic">Command output will appear here in real-time...</span>
        {/if}
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center text-xs text-rina-slate-dark pb-8 mt-8" in:fade={{ duration: 300, delay: 700 }}>
      Project Rina — Complete Setup Wizard · A to Z
    </div>
  </div>
</div>
