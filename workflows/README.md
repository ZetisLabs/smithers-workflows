# Workflows

Ce dossier contient les workflows Smithers pour automatiser les tâches de développement.

## dispatch.tsx

**Dispatcher intelligent d'issues** — Analyse les issues GitHub et les route vers les agents appropriés.

### Utilisation

```bash
# Analyser et router une issue
OWNER=ZetisLabs REPO=invoice-reminder ISSUE=42 bun run workflows/dispatch.tsx
```

### Fonctionnement

Le dispatcher :
1. **Récupère les détails de l'issue** (titre, description, labels)
2. **Analyse le contenu** pour déterminer le type et la portée
3. **Route vers les agents appropriés** :
   - `frontend` → UI/UX, React, TypeScript, performance, accessibilité
   - `backend` → API, base de données, auth, microservices
   - `testing` → Tests unitaires, intégration, e2e, couverture
   - `review` → Revue de code, architecture, qualité
   - `security` → Vulnérabilités, OWASP, dépendances
4. **Ajoute des labels** si manquants (ex: "frontend", "backend")
5. **Poste un commentaire** expliquant le routage et les prochaines étapes

### Logique de routage

#### Basé sur les labels (prioritaire)
- `frontend`, `ui`, `ux` → **frontend agent**
- `backend`, `api`, `database` → **backend agent**
- `security`, `vulnerability`, `dependencies` → **security agent**
- `testing`, `test`, `coverage` → **testing agent**
- `bug` → **review agent** (pour analyser la cause)
- `enhancement`, `feature` → analyse du contenu

#### Basé sur le contenu (si pas de labels clairs)
- Mots-clés UI/composants/styling → **frontend**
- Mots-clés API/serveur/BDD → **backend**
- Mots-clés tests/coverage → **testing**
- Mots-clés CVE/sécurité → **security**
- Mots-clés refactoring/architecture → **review**

#### Multi-agents (quand nécessaire)
- Features full-stack → **frontend + backend**
- Changements critiques → **agent principal + security**
- Nouvelles features → **agent principal + testing**
- Refactoring majeur → **review + testing**

### Exemple de sortie

Le dispatcher poste un commentaire structuré :

```markdown
👋 Bonjour ! J'ai analysé cette issue.

**Type**: Feature  
**Portée**: Full-stack  
**Agents assignés**: Frontend, Backend, Testing  
**Priorité**: Medium  

**Raisonnement**:  
Cette fonctionnalité nécessite des modifications UI (formulaire de connexion) 
et backend (endpoint d'authentification). Des tests seront nécessaires pour 
valider le flux complet.

**Labels suggérés**: `frontend`, `backend`, `testing`, `enhancement`

**Prochaines étapes**:  
1. L'équipe frontend créera les composants UI
2. L'équipe backend implémentera l'API d'auth
3. L'équipe testing ajoutera les tests e2e

Des questions ou besoin de clarifications ? 🚀
```

## pr-review.tsx

**Revue automatique de PR** — Analyse les pull requests et poste une revue détaillée.

### Utilisation

```bash
# Reviewer une PR
OWNER=ZetisLabs REPO=invoice-reminder PR=89 bun run workflows/pr-review.tsx
```

### Fonctionnement

1. Récupère le diff de la PR
2. Analyse le code (qualité, bugs, performance, sécurité)
3. Poste une revue avec `APPROVE`, `REQUEST_CHANGES`, ou `COMMENT`

## test-coverage.tsx (à venir)

**Analyse de couverture de tests** — Identifie le code non testé et vérifie la qualité des tests.

### Utilisation prévue

```bash
# Analyser la couverture de tests
OWNER=ZetisLabs REPO=invoice-reminder bun run workflows/test-coverage.tsx
```

### Fonctionnalités prévues

1. **Identifier le code non testé**
   - Parser les rapports de couverture (coverage.json, lcov)
   - Lister les fichiers/fonctions sans tests
   - Prioriser par criticité (auth, paiements, etc.)

2. **Vérifier la qualité des tests**
   - Tests significatifs vs tests "pour la couverture"
   - Edge cases couverts
   - Mocking approprié
   - Assertions pertinentes

3. **Générer un rapport**
   - Couverture globale et par module
   - Gaps critiques
   - Suggestions de tests manquants
   - Exemples de tests à ajouter

4. **Poster une issue ou PR comment**
   - Résumé de la couverture
   - Liste des fichiers prioritaires à tester
   - Templates de tests suggérés

---

## Variables d'environnement requises

```bash
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

## Développement

### Créer un nouveau workflow

1. Créer un fichier `.tsx` dans `workflows/`
2. Importer les agents nécessaires depuis `../agents/`
3. Définir le workflow avec `<Workflow>`, `<Agent>`, `<Tool>`, `<Prompt>`
4. Appeler `render(workflow)` à la fin
5. Documenter l'usage dans ce README

### Structure type

```tsx
import { Workflow, Agent, Tool, Prompt, render } from 'smithers'
import { Octokit } from '@octokit/rest'
import { SomeAgent } from '../agents/some-agent'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

const workflow = (
  <Workflow name="my-workflow">
    <Agent name="orchestrator" model="claude-sonnet-4-20250514">
      <Prompt>
        Your instructions here...
      </Prompt>
      
      <Tool
        name="my_tool"
        description="What it does"
        parameters={{ /* schema */ }}
        execute={async (input) => {
          // Implementation
          return "result"
        }}
      />
    </Agent>
  </Workflow>
)

render(workflow)
```
