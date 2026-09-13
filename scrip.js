const SUPABASE_URL = "https://efnqxsxdpanpcyfbwtes.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_m2lOIUxo6FVmufkFPjxpNA_F3XIcg90";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentFamily = null;
let currentRole = null; // 'admin' ou child_id
let childrenList = [];
let tasksList = [];

// Tâches types par jour pour initialiser automatiquement les enfants
const DEFAULT_TASKS_ROTATION = [
  ["Mettre la table", "Vider le lave-vaisselle"],
  ["Débarrasser la table", "Remplir le lave-vaisselle"],
  ["Ranger le salon", "Sortir les poubelles"]
];
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Bascule login / register
function showAuthMode(mode) {
  const loginForm = document.getElementById('form-login');
  const regForm = document.getElementById('form-register');
  const loginTab = document.getElementById('tab-btn-login');
  const regTab = document.getElementById('tab-btn-register');
  const statusMsg = document.getElementById('auth-status-msg');
  if (statusMsg) statusMsg.innerText = '';

  if (mode === 'register') {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    loginTab.classList.remove('active');
    regTab.classList.add('active');
  } else {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    loginTab.classList.add('active');
    regTab.classList.remove('active');
  }
}

// 1. Inscription
async function handleRegister(e) {
  e.preventDefault();
  const statusMsg = document.getElementById('auth-status-msg');
  const submitBtn = document.getElementById('btn-reg-submit');
  const familyName = document.getElementById('reg-family-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  submitBtn.disabled = true;
  statusMsg.style.color = 'var(--text-muted)';
  statusMsg.innerText = 'Création du compte...';

  try {
    const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email, password });
    if (authError) throw authError;

    const { data: famData, error: famError } = await supabaseClient
      .from('families')
      .insert([{ parent_email: email, family_name: familyName }])
      .select()
      .single();

    if (famError) throw famError;

    currentFamily = famData;
    checkFamilySetup();
  } catch (err) {
    statusMsg.style.color = '#DC2626';
    statusMsg.innerText = err.message || "Erreur lors de la création.";
  } finally {
    submitBtn.disabled = false;
  }
}

// 2. Connexion
async function handleLogin(e) {
  e.preventDefault();
  const statusMsg = document.getElementById('auth-status-msg');
  const submitBtn = document.getElementById('btn-login-submit');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  submitBtn.disabled = true;
  statusMsg.style.color = 'var(--text-muted)';
  statusMsg.innerText = 'Connexion...';

  try {
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (authError) throw authError;

    const { data: famData, error: famError } = await supabaseClient
      .from('families')
      .select('*')
      .eq('parent_email', email)
      .single();

    if (famError) throw famError;

    currentFamily = famData;
    checkFamilySetup();
  } catch (err) {
    statusMsg.style.color = '#DC2626';
    statusMsg.innerText = err.message || "Identifiants incorrects.";
  } finally {
    submitBtn.disabled = false;
  }
}

// 3. Vérification : y a-t-il déjà des enfants configurés ?
async function checkFamilySetup() {
  document.getElementById('login-screen').style.display = 'none';

  const { data: kids } = await supabaseClient
    .from('children')
    .select('*')
    .eq('family_id', currentFamily.id)
    .order('created_at', { ascending: true });

  if (!kids || kids.length < 2) {
    showSetupScreen();
  } else {
    childrenList = kids;
    showProfileSelectScreen();
  }
}

// 4. Écran de configuration initiale si nouveau compte
function showSetupScreen() {
  document.getElementById('profile-select-screen').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  const setupView = document.getElementById('setup-screen');
  setupView.style.display = 'flex';

  const list = document.getElementById('setup-kids-list');
  list.innerHTML = '';
  // Par défaut : 2 champs d'enfants au départ
  addKidInputRow('Enfant 1');
  addKidInputRow('Enfant 2');
}

function addKidInputRow(defaultName = '') {
  const list = document.getElementById('setup-kids-list');
  const index = list.children.length + 1;
  const div = document.createElement('div');
  div.className = 'field';
  div.innerHTML = `
    <label>Prénom Enfant ${index}</label>
    <div style="display:flex; gap:8px;">
      <input type="text" class="setup-kid-name" placeholder="Ex: Noah, Léa..." value="${defaultName}" required style="flex:1;">
      ${index > 2 ? `<button type="button" onclick="this.parentElement.parentElement.remove()" style="background:#EF4444;color:white;border:none;border-radius:10px;padding:0 12px;cursor:pointer;">✕</button>` : ''}
    </div>
  `;
  list.appendChild(div);
}

// Enregistrement des enfants + initialisation automatique des plannings
async function saveInitialChildren() {
  const inputs = document.querySelectorAll('.setup-kid-name');
  const names = Array.from(inputs).map(i => i.value.trim()).filter(n => n.length > 0);

  if (names.length < 2) {
    alert("Veuillez saisir au moins 2 prénoms d'enfants.");
    return;
  }

  // 1. Insertion des enfants dans la table children
  const kidsToInsert = names.map((name, idx) => ({
    family_id: currentFamily.id,
    name: name,
    avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`,
    bonus_wallet: 0.00
  }));

  const { data: createdKids, error: kError } = await supabaseClient
    .from('children')
    .insert(kidsToInsert)
    .select();

  if (kError) {
    alert("Erreur lors de l'enregistrement des enfants : " + kError.message);
    return;
  }

  // 2. Génération automatique du planning de la semaine pour chaque enfant
  const tasksToInsert = [];
  createdKids.forEach((kid, kidIdx) => {
    DAYS.forEach((day, dayIdx) => {
      // Rotation équitable des corvées quotidiennes
      const rot = (kidIdx + dayIdx) % DEFAULT_TASKS_ROTATION.length;
      const chores = DEFAULT_TASKS_ROTATION[rot];
      chores.forEach(chore => {
        tasksToInsert.push({
          family_id: currentFamily.id,
          child_id: kid.id,
          task_name: chore,
          day_of_week: day,
          is_bonus: false,
          points_value: 0.5,
          status_completed: false
        });
      });
    });
  });

  await supabaseClient.from('tasks').insert(tasksToInsert);

  childrenList = createdKids;
  document.getElementById('setup-screen').style.display = 'none';
  showProfileSelectScreen();
}

// 5. Écran de sélection de profil
function showProfileSelectScreen() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  const screen = document.getElementById('profile-select-screen');
  screen.style.display = 'flex';

  const title = document.getElementById('family-title-banner');
  if (title && currentFamily) title.innerText = currentFamily.family_name;

  const grid = document.getElementById('profiles-grid');
  grid.innerHTML = childrenList.map(k => `
    <button type="button" class="profile-card-btn" onclick="selectRole('${k.id}')">
      <img src="${k.avatar_url}" alt="${k.name}" class="profile-card-avatar">
      <strong>${k.name}</strong>
    </button>
  `).join('');
}

function selectRole(roleId) {
  currentRole = roleId;
  document.getElementById('profile-select-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const userTag = document.getElementById('user-tag');
  if (roleId === 'admin') {
    userTag.innerText = "Parents ⚙️";
    document.getElementById('admin-reset-card').style.display = 'block';
  } else {
    const kid = childrenList.find(c => c.id === roleId);
    userTag.innerText = kid ? kid.name : "";
    document.getElementById('admin-reset-card').style.display = 'none';
  }

  buildNavigationAndSections();
  loadData();
}

function returnToProfileSelect() {
  showProfileSelectScreen();
}

// Construction dynamique des onglets et vues selon les N enfants
function buildNavigationAndSections() {
  const nav = document.getElementById('nav-container');
  nav.innerHTML = '';

  // Onglet Duel
  const dashBtn = document.createElement('button');
  dashBtn.type = 'button';
  dashBtn.className = 'nav-tab active';
  dashBtn.innerText = '📊 Duel';
  dashBtn.onclick = () => switchTab('dash', dashBtn);
  nav.appendChild(dashBtn);

  // Onglets Enfants (Visibles pour Admin ou pour l'enfant concerné)
  const sectionsContainer = document.getElementById('dynamic-kids-sections');
  sectionsContainer.innerHTML = '';

  const bonusSelect = document.getElementById('bonus-assign');
  bonusSelect.innerHTML = '';

  childrenList.forEach(k => {
    bonusSelect.innerHTML += `<option value="${k.id}">${k.name}</option>`;

    if (currentRole === 'admin' || currentRole === k.id) {
      const kidBtn = document.createElement('button');
      kidBtn.type = 'button';
      kidBtn.className = 'nav-tab';
      kidBtn.innerText = `👦 ${k.name}`;
      kidBtn.onclick = () => switchTab(`kid-${k.id}`, kidBtn);
      nav.appendChild(kidBtn);
    }

    // Vue HTML de l'enfant
    const sec = document.createElement('section');
    sec.id = `tab-kid-${k.id}`;
    sec.style.display = 'none';
    sec.innerHTML = `
      <div class="card">
        <div class="section-title">
          <h3>Planning ${k.name}</h3>
          <span class="badge-rule">0,5 pt / tâche</span>
        </div>
        <div id="tasks-list-${k.id}"></div>
      </div>
    `;
    sectionsContainer.appendChild(sec);
  });

  // Si c'est un enfant connecté, pré-sélectionner son nom sur le formulaire bonus
  if (currentRole !== 'admin') {
    bonusSelect.value = currentRole;
  }

  // Onglet Bonus
  const bonusBtn = document.createElement('button');
  bonusBtn.type = 'button';
  bonusBtn.className = 'nav-tab';
  bonusBtn.innerText = '⭐ Bonus';
  bonusBtn.onclick = () => switchTab('bonus', bonusBtn);
  nav.appendChild(bonusBtn);

  switchTab('dash', dashBtn);
}

function switchTab(id, btn) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const allSections = document.querySelectorAll('main > section, #dynamic-kids-sections > section');
  allSections.forEach(s => s.style.display = 'none');

  const target = document.getElementById(`tab-${id}`);
  if (target) target.style.display = 'block';
}

// Chargement des données depuis Supabase
async function loadData() {
  const sync = document.getElementById('sync-indicator');
  if (sync) sync.innerText = 'Synchronisation...';

  // 1. Récupération enfants à jour
  const { data: kids } = await supabaseClient
    .from('children')
    .select('*')
    .eq('family_id', currentFamily.id)
    .order('created_at', { ascending: true });

  if (kids) childrenList = kids;

  // 2. Récupération tâches à jour
  const { data: tasks } = await supabaseClient
    .from('tasks')
    .select('*')
    .eq('family_id', currentFamily.id);

  if (tasks) tasksList = tasks;

  if (sync) sync.innerText = '🟢 Supabase OK';
  renderApp();
}

// Coche / décoche d'une tâche
async function toggleTaskMulti(taskId, newStatus) {
  const task = tasksList.find(t => t.id === taskId);
  if (task) task.status_completed = newStatus;
  renderApp();

  await supabaseClient
    .from('tasks')
    .update({ status_completed: newStatus })
    .eq('id', taskId);
}

// Ajout d'une tâche bonus réalisée
async function submitBonusMulti(taskName) {
  const select = document.getElementById('bonus-assign');
  let targetChildId = select ? select.value : childrenList[0].id;
  if (currentRole !== 'admin') targetChildId = currentRole;

  const kid = childrenList.find(k => k.id === targetChildId);
  if (!kid) return;

  const newWallet = Number((Number(kid.bonus_wallet || 0) + 1.00).toFixed(2));
  kid.bonus_wallet = newWallet;
  renderApp();

  await supabaseClient
    .from('children')
    .update({ bonus_wallet: newWallet })
    .eq('id', targetChildId);

  alert(`+1,00 € attribué à ${kid.name} pour : ${taskName} ! ⭐`);
}

// Clôture de la semaine pour N enfants (verrouille le fratricide et reset tâches)
async function closeWeekMulti() {
  if (!confirm("⚠️ Clôturer la semaine ?\n\nLes gains nets après vol seront définitivement enregistrés et les tâches quotidiennes repartiront à zéro.")) return;

  const sync = document.getElementById('sync-indicator');
  if (sync) sync.innerText = 'Clôture...';

  // 1. Calcul et sauvegarde des nouveaux porte-monnaies nets calculés
  const stats = calculateNetEarnings();
  for (const s of stats) {
    await supabaseClient
      .from('children')
      .update({ bonus_wallet: s.netWallet })
      .eq('id', s.id);
  }

  // 2. Reset des tâches quotidiennes à false
  await supabaseClient
    .from('tasks')
    .update({ status_completed: false })
    .eq('family_id', currentFamily.id)
    .eq('is_bonus', false);

  await loadData();
  alert("Semaine clôturée avec succès ! Les cagnottes sont verrouillées.");
}

// Paiement en espèces (vide les porte-monnaies)
async function payKidsMulti() {
  if (!confirm("💶 Confirmer le versement aux enfants ?\n\nCela remettra tous les porte-monnaies à 0,00 €.")) return;

  for (const k of childrenList) {
    await supabaseClient
      .from('children')
      .update({ bonus_wallet: 0.00 })
      .eq('id', k.id);
  }

  await loadData();
  alert("Porte-monnaies remis à 0,00 € !");
}

// Moteur de calcul du Fratricide pour N enfants
function calculateNetEarnings() {
  return childrenList.map(kid => {
    const kidTasks = tasksList.filter(t => t.child_id === kid.id && !t.is_bonus);
    const totalPossible = kidTasks.length * 0.5;
    const completedPts = kidTasks.filter(t => t.status_completed).length * 0.5;
    const rate = totalPossible > 0 ? (completedPts / totalPossible) : 0;
    return {
      id: kid.id,
      name: kid.name,
      avatar: kid.avatar_url,
      pts: completedPts,
      rate: rate,
      baseWallet: Number(kid.bonus_wallet || 0),
      netWallet: Number(kid.bonus_wallet || 0)
    };
  }).map((currentKid, _, all) => {
    // Le fratricide à N enfants : chaque enfant prend (ou donne) aux autres selon l'écart
    let transferSum = 0;
    all.forEach(other => {
      if (other.id !== currentKid.id) {
        if (currentKid.rate > other.rate) {
          const diff = currentKid.rate - other.rate;
          const stolen = (other.baseWallet * diff) / (all.length - 1);
          transferSum += stolen;
        } else if (currentKid.rate < other.rate) {
          const diff = other.rate - currentKid.rate;
          const lost = (currentKid.baseWallet * diff) / (all.length - 1);
          transferSum -= lost;
        }
      }
    });
    const finalWallet = Math.max(0, currentKid.baseWallet + transferSum);
    return {
      ...currentKid,
      netWallet: Number(finalWallet.toFixed(2)),
      delta: Number(transferSum.toFixed(2))
    };
  });
}

// Rendu complet de l'interface
function renderApp() {
  const stats = calculateNetEarnings();

  // 1. Leaderboard
  const sorted = [...stats].sort((a, b) => b.pts - a.pts);
  const leader = sorted[0];
  const leaderPhoto = document.getElementById('leader-photo');
  const leaderName = document.getElementById('leader-name');
  const leaderDesc = document.getElementById('leader-desc');

  if (leader && leader.pts > 0) {
    if (leaderName) leaderName.innerText = `${leader.name} en tête !`;
    if (leaderDesc) leaderDesc.innerText = `${leader.pts.toFixed(1)} points quotidiens (${(leader.rate * 100).toFixed(0)}% d'assiduité)`;
    if (leaderPhoto) leaderPhoto.src = leader.avatar;
  } else {
    if (leaderName) leaderName.innerText = "Égalité parfaite !";
    if (leaderDesc) leaderDesc.innerText = "Le duel commence pour la fratrie";
    if (leaderPhoto) leaderPhoto.src = "https://api.dicebear.com/7.x/bottts/svg?seed=duel";
  }

  // 2. Cartes individuelles des enfants
  const cardsContainer = document.getElementById('kids-cards-container');
  if (cardsContainer) {
    cardsContainer.innerHTML = stats.map(s => `
      <div class="kid-box">
        <div class="kid-head">
          <h3>${s.name}</h3>
          <span class="pill-pts">${s.pts.toFixed(1)} pts</span>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);">Bonus bruts : <strong>${s.baseWallet.toFixed(2)} €</strong></p>
        <div class="final-box">
          Porte-monnaie net : <strong style="color:var(--noah-accent);">${s.netWallet.toFixed(2)} €</strong>
        </div>
      </div>
    `).join('');
  }

  // 3. Explications de péréquation
  const diffContainer = document.getElementById('diff-text-container');
  if (diffContainer) {
    diffContainer.innerHTML = stats.map(s => {
      if (s.delta > 0) return `<p>• <strong>${s.name}</strong> gagne <strong>+${s.delta.toFixed(2)} €</strong> grâce à son assiduité.</p>`;
      if (s.delta < 0) return `<p>• <strong>${s.name}</strong> cède <strong>${Math.abs(s.delta).toFixed(2)} €</strong> à la fratrie.</p>`;
      return `<p>• <strong>${s.name}</strong> : solde stable.</p>`;
    }).join('');
  }

  // 4. Rendu des listes de tâches quotidiennes par enfant
  childrenList.forEach(k => {
    const listDiv = document.getElementById(`tasks-list-${k.id}`);
    if (listDiv) {
      const kidTasks = tasksList.filter(t => t.child_id === k.id && !t.is_bonus);
      listDiv.innerHTML = kidTasks.map(t => `
        <div class="task-row">
          <div class="task-info">
            <strong>${t.day_of_week}</strong>
            <span>${t.task_name}</span>
          </div>
          <label class="switch">
            <input type="checkbox" ${t.status_completed ? 'checked' : ''} onchange="toggleTaskMulti('${t.id}', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
      `).join('');
    }
  });
}

// Thèmes & Session
function setTheme(name) {
  document.body.setAttribute('data-theme', name);
  localStorage.setItem('fratricide_theme', name);
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('fratricide_theme') || 'ios';
  setTheme(savedTheme);

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    const { data: famData } = await supabaseClient
      .from('families')
      .select('*')
      .eq('parent_email', session.user.email)
      .single();

    if (famData) {
      currentFamily = famData;
      checkFamilySetup();
    }
  }
});
