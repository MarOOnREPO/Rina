<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { setupApi, type SetupStatus, type SetupEnvResponse } from '$lib/utils/api';

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
      description: 'SSH into your Lightsail instance and update the system.',
      action: 'info',
      commands: `sudo apt update && sudo apt upgrade -y

# Create project directory
mkdir -p ~/rina
cd ~/rina`,
      note: 'Make sure Docker & Docker Compose are installed.'
    },
    {
      id: 'get-code',
      number: 2,
      title: 'Get the Code',
      emoji: '📥',
      description: 'Push to main (CI deploys automatically) or rsync manually.',
      action: 'info',
      commands: `# Option A: GitHub Actions (recommended)
# Just push to main — the workflow rsyncs to /home/ubuntu/rina

# Option B: Manual rsync from local machine
rsync -avz --exclude='node_modules' --exclude='.git' ./ ubuntu@YOUR_IP:~/rina`,
      note: 'Make sure frontend/build exists before syncing. CI handles this automatically.'
    },
    {
      id: 'configure-env',
      number: 3,
      title: 'Configure Environment',
      emoji: '⚙️',
      description: 'Fill in every environment variable below and save.',
      action: 'form',
      note: 'All fields are required for a working deployment.'
    },
    {
      id: 'init-ssl',
      number: 4,
      title: 'Initialize SSL',
      emoji: '🔒',
      description: 'Get a Let\'s Encrypt certificate for your domain.',
      action: 'ssl',
      commands: `./scripts/init-ssl.sh your-domain.com your-email@example.com`,
      note: 'This starts a temporary HTTP nginx, runs Certbot, then switches to HTTPS.'
    },
    {
      id: 'deploy',
      number: 5,
      title: 'Deploy the App',
      emoji: '🚀',
      description: 'Start Postgres, migrate the DB, and launch all services.',
      action: 'deploy',
      commands: `./scripts/deploy.sh`,
      note: 'This waits for Postgres, runs Prisma migrations, builds containers, and health-checks.'
    },
    {
      id: 'verify',
      number: 6,
      title: 'Verify Deployment',
      emoji: '✅',
      description: 'Confirm all services are healthy.',
      action: 'verify',
      commands: `https://your-domain.com
https://your-domain.com/api/health`,
      note: 'Click Run Check below to test backend connectivity.'
    },
    {
      id: 'backups',
      number: 7,
      title: 'Enable Backups',
      emoji: '💾',
      description: 'Test the backup script, then add it to cron.',
      action: 'backup',
      commands: `crontab -e
# Add:
0 3 * * * /home/ubuntu/rina/scripts/backup-db.sh >> /home/ubuntu/rina/backups/backup.log 2>&1`,
      note: 'Test manually first with the Run button below.'
    },
    {
      id: 'firewall',
      number: 8,
      title: 'Firewall (UFW)',
      emoji: '🛡️',
      description: 'Lock down the server. Only expose SSH, HTTP, and HTTPS.',
      action: 'info',
      commands: `sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable`,
      note: 'Do NOT open port 3000 or 9000. Nginx is the only public entrypoint.'
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

  let envLoaded = $state(false);
  let saving = $state(false);
  let saveMsg = $state('');

  // ─── Wizard State ──────────────────────────────────────────────
  let completed = $state<Set<string>>(new Set());
  let expanded = $state<string | null>('configure-env');
  let status = $state<SetupStatus | null>(null);
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
      const data: SetupEnvResponse = await setupApi.getEnv();
      if (data.exists) {
        envForm = { ...envForm, ...data.env };
        envLoaded = true;
      }
    } catch {
      // ignore
    }
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
        appendConsole('❌ Please enter Domain and Email in the SSL step.');
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
      } finally {
        runningStep = null;
      }
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
      } finally {
        runningStep = null;
      }
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
      } finally {
        runningStep = null;
      }
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
      appendConsole(`🔍 Status: DB=${status.checks.database}, Redis=${status.checks.redis}, S3=${status.checks.s3}, Env=${status.checks.env}`);
    } catch (err: any) {
      status = null;
      appendConsole(`❌ Health check failed: ${err.message || err}`);
    } finally {
      checking = false;
    }
  }

  function generateSecret() {
    const arr = new Uint8Array(48);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
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

  <div class="max-w-4xl mx-auto relative z-10">
    <!-- Header -->
    <div class="text-center mb-8" in:fly={{ y: -20, duration: 500 }}>
      <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rina-rose/10 border border-rina-rose/20 text-rina-rose text-xs font-semibold mb-4">
        🚀 Complete Deployment Wizard
      </div>
      <h1 class="text-4xl md:text-5xl font-bold text-gradient mb-3">Setup Rina</h1>
      <p class="text-rina-slate text-sm md:text-base max-w-lg mx-auto">
        Configure, deploy, and verify your private sanctuary — all from this page.
      </p>
    </div>

    <!-- Progress -->
    <div class="glass-strong rounded-2xl p-5 mb-8 shadow-2xl" in:fly={{ y: 20, duration: 400, delay: 100 }}>
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-rina-slate">Progress</span>
        <span class="text-sm font-bold {allDone ? 'text-emerald-400' : 'text-white'}">
          {completed.size} / {steps.length}
        </span>
      </div>
      <div class="w-full h-2.5 bg-rina-bg rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-rina-rose to-rina-indigo" style="width: {progressPercent}%"></div>
      </div>
      {#if allDone}
        <div class="mt-3 text-center text-emerald-400 text-sm font-medium" in:fade>🎉 Setup complete!</div>
      {/if}
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

            <!-- Expanded -->
            {#if expanded === step.id}
              <div class="px-4 md:px-5 pb-5" transition:slide={{ duration: 300 }}>

                <!-- Environment Form (Step 3) -->
                {#if step.action === 'form'}
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    {#each [
                      { key: 'DOMAIN', label: 'Domain', placeholder: 'rina.example.com', type: 'text' },
                      { key: 'POSTGRES_PASSWORD', label: 'Postgres Password', placeholder: 'openssl rand -hex 32', type: 'password' },
                      { key: 'JWT_SECRET', label: 'JWT Secret', placeholder: '64+ char random', type: 'password' },
                      { key: 'COOKIE_SECRET', label: 'Cookie Secret', placeholder: 'Different from JWT', type: 'password' },
                      { key: 'CORS_ORIGIN', label: 'CORS Origin', placeholder: 'https://rina.example.com', type: 'text' },
                      { key: 'REDIS_URL', label: 'Redis URL', placeholder: 'redis://redis:6379', type: 'text' },
                      { key: 'AWS_REGION', label: 'AWS Region', placeholder: 'us-east-1', type: 'text' },
                      { key: 'AWS_ACCESS_KEY_ID', label: 'AWS Access Key ID', placeholder: 'AKIA...', type: 'text' },
                      { key: 'AWS_SECRET_ACCESS_KEY', label: 'AWS Secret Key', placeholder: 'your-secret', type: 'password' },
                      { key: 'S3_BUCKET_NAME', label: 'S3 Bucket Name', placeholder: 'rina-uploads', type: 'text' },
                      { key: 'MAROON_PASSWORD_HASH', label: 'Maroon Password Hash', placeholder: '$2a$12$...', type: 'password' },
                      { key: 'RINA_PASSWORD_HASH', label: 'Rina Password Hash', placeholder: '$2a$12$...', type: 'password' },
                      { key: 'TMDB_API_KEY', label: 'TMDB API Key', placeholder: 'optional', type: 'text' },
                      { key: 'VITE_MAPBOX_TOKEN', label: 'Mapbox Token', placeholder: 'optional', type: 'text' },
                      { key: 'VAPID_PUBLIC_KEY', label: 'VAPID Public Key', placeholder: 'web-push key', type: 'text' },
                      { key: 'VAPID_PRIVATE_KEY', label: 'VAPID Private Key', placeholder: 'web-push key', type: 'password' },
                      { key: 'COTURN_REALM', label: 'Coturn Realm', placeholder: 'your-domain.com', type: 'text' },
                      { key: 'COTURN_SECRET', label: 'Coturn Secret', placeholder: 'random hex', type: 'password' },
                    ] as field}
                      <div class="flex flex-col gap-1">
                        <label class="text-xs text-rina-slate font-medium flex items-center justify-between">
                          <span>{field.label}</span>
                          {#if field.type === 'password'}
                            <button type="button" class="text-[10px] text-rina-rose hover:underline" onclick={() => { envForm[field.key] = generateSecret(); }}>
                              Generate
                            </button>
                          {/if}
                        </label>
                        <input
                          type={field.type}
                          bind:value={envForm[field.key]}
                          placeholder={field.placeholder}
                          class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white placeholder-rina-slate-dark
                            focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/30 transition-all"
                        />
                      </div>
                    {/each}
                  </div>
                  <div class="mt-4 flex items-center gap-3">
                    <button onclick={saveEnv} disabled={saving} class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rina-rose to-rina-indigo text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50">
                      {saving ? '⏳ Saving...' : '💾 Save Configuration'}
                    </button>
                    <button onclick={loadEnv} class="px-4 py-2.5 rounded-xl bg-rina-bg border border-rina-border text-rina-slate text-sm hover:border-rina-rose/50 transition-all">
                      🔄 Reload
                    </button>
                    {#if saveMsg}
                      <span class="text-xs {saveMsg.includes('Failed') ? 'text-rose-400' : 'text-emerald-400'}" in:fade>{saveMsg}</span>
                    {/if}
                  </div>
                {/if}

                <!-- SSL Inputs (Step 4) -->
                {#if step.action === 'ssl'}
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    <div class="flex flex-col gap-1">
                      <label class="text-xs text-rina-slate font-medium">Domain</label>
                      <input bind:value={sslDomain} placeholder="rina.example.com" class="w-full px-3 py-2 rounded-xl bg-rina-bg border border-rina-border text-sm text-white focus:outline-none focus:border-rina-rose/50" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-xs text-rina-slate font-medium">Email</label>
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

                <!-- Note -->
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
      <div id="setup-console" class="bg-black/40 rounded-xl p-4 h-48 overflow-y-auto font-mono text-[11px] leading-relaxed text-rina-slate whitespace-pre-wrap border border-rina-border/30">
        {#if consoleOutput}
          {consoleOutput}
        {:else}
          <span class="text-rina-slate-dark italic">Command output will appear here...</span>
        {/if}
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center text-xs text-rina-slate-dark pb-8 mt-8" in:fade={{ duration: 300, delay: 700 }}>
      Project Rina — Complete Setup Wizard
    </div>
  </div>
</div>
