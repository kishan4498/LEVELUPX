# LevelUpX UI/UX Refinement Blueprint

This document is the design source of truth for the full-site UI refinement.
Read it before starting a new UI fragment.

## Product Experience Goal

LevelUpX should feel like a focused RPG command center for real productivity:

- gameful, but not childish
- energetic, but not distracting
- expressive, but still easy to scan every day
- rewarding after meaningful actions, not noisy during routine work
- consistent across user, social, analytics, and admin workflows

The interface should make four things obvious at a glance:

1. What should I do next?
2. What progress did I make?
3. What did I earn?
4. What changed because of my action?

## Research Principles

The refinement follows these researched principles:

- **Visible system status:** actions need nearby, immediate feedback. This is especially important in game interfaces, where users need to know whether an action worked.
- **Meaningful progression:** levels, XP, streaks, quests, rewards, and rankings should be visible where they help users decide or feel progress, not added as decoration.
- **Purposeful motion:** motion should connect states, reinforce hierarchy, and celebrate important outcomes. Routine screens should remain calm.
- **Unified movement:** related elements should move together instead of animating independently.
- **Accessible motion:** every non-essential animation must respect `prefers-reduced-motion`.
- **Legible game UI:** important words, status, contrast, touch targets, and progress must remain clear on small screens.
- **Consistent interaction language:** similar actions use the same control, feedback, color, and motion patterns throughout the app.

Research references:

- Material Design 3 motion overview: https://m3.material.io/styles/motion/overview/how-it-works
- Material Design 3 transitions: https://m3.material.io/styles/motion/transitions
- Material Design 3 typography roles: https://m3.material.io/styles/typography/overview
- MDN `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion
- W3C animation from interactions: https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions
- Nielsen Norman Group video-game heuristics: https://www.nngroup.com/articles/usability-heuristics-applied-video-games/
- Nielsen Norman Group microinteractions: https://www.nngroup.com/articles/microinteractions/
- Game Accessibility Guidelines examples: https://gameaccessibilityguidelines.com/happy-wars-instructions/

## Experience Direction: Quest Command Center

The visual language combines a quiet productivity workspace with RPG HUD signals.

### Core Mood

- Base surfaces: cool neutral paper and clean white
- Navigation: deep charcoal, not blue-black
- Progress: mint
- Primary action / mastery: violet
- Reward / currency: gold and ember
- Information: sky blue
- Risk: ember

The palette must stay multi-accent. No page should become a single-hue purple,
blue, beige, or dark theme.

### Shape And Depth

- Standard radius: 6px
- Framed panels and repeated items: maximum 8px radius
- Buttons and fields: 6px radius
- Shadows: compact and directional, never large floating marketing shadows
- Borders: visible enough to organize dense information
- No nested decorative cards
- No decorative gradient orbs, bokeh, or oversized marketing hero sections

### Typography

- Display role: page title and major progression moments only
- Title role: section headings and panel titles
- Body role: explanations and activity text
- Label role: navigation, status, metadata, and controls
- Letter spacing remains `0`
- Compact operational pages keep compact type sizes

## Gameful Interaction Model

### Persistent Player HUD

The main shell should always provide:

- current level
- XP progress toward the next level
- coin balance
- current streak
- clear active navigation state
- notification count

### Feedback Levels

- **Routine feedback:** subtle border, color, or 1-2px movement
- **Meaningful success:** short rise/pop motion and a clear result summary
- **Milestone celebration:** staged animation, reward details, and history update
- **Failure/risk:** calm, direct explanation with recovery action

### Motion Rules

- Standard interaction: 140-220ms
- Panel/page entrance: 260-420ms
- Celebration: up to 1600ms, then settle
- Avoid infinite ambient animations
- Avoid large parallax, aggressive scaling, flashing, or scroll-linked motion
- Disable non-essential transforms and animation under reduced-motion settings

## Shared Component Rules

- Buttons visibly respond to hover, press, focus, loading, and disabled states.
- Inputs have persistent labels, strong focus states, and stable dimensions.
- Progress bars always include a text/ARIA value.
- Status must never rely on color alone.
- Empty states should name the next useful action.
- Loading states should preserve layout dimensions.
- Icon-only actions require accessible labels/tooltips.

## Page Refinement Roadmap

| Fragment | Area | Main Goal |
| --- | --- | --- |
| UI-01 | Foundation, app shell, auth shell | Establish tokens, HUD, navigation, shared motion, controls |
| UI-02 | Dashboard | Create a useful daily mission-control screen |
| UI-03 | Quests and focus | Make the core productivity loop feel tactile and rewarding |
| UI-04 | Profile, skills, achievements, rewards | Strengthen character progression and collection experience |
| UI-05 | Analytics and insights | Improve data hierarchy, recommendations, and explainability |
| UI-06 | Guilds and leaderboards | Improve social identity, team goals, and healthy competition |
| UI-07 | Notifications and reports | Improve inbox scanning, preferences, and report clarity |
| UI-08 | Admin and super-admin | Refine dense operational monitoring without making it playful |
| UI-09 | Auth and account security polish | Refine staged login, password recovery, and security status |
| UI-10 | Responsive, accessibility, motion, final QA | Whole-site consistency and edge-case review |

## Definition Of Done For Every UI Fragment

- Desktop and mobile layouts are intentional.
- Text does not overlap, clip, or overflow controls.
- Loading, empty, error, success, and disabled states remain usable.
- Motion has a reduced-motion fallback.
- The fragment passes frontend typecheck and production build.
- `UI_UX_PROGRESS.md`, `PROJECT_LOG.md`, and `PROJECT_HISTORY.md` are updated.

