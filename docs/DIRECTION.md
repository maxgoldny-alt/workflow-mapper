# Workflow Mapper — direction after product call (2026-09-24)

Context: the earlier overview (area cards + links, swimlane canvas beneath) was the
right foundation and needed tuning. The business-loop commits replaced it with a
forced cycle. Keep what's good (stage page tabs, contextual AI, parked hand editor);
restore the overview semantics.

## Decisions

0. Stage chain = table of contents, not the product. The overview is a mini-map that
   tells you where to dig; the real map is what's underneath each stage.
1. Rename "Loop" to "Overview". It is an ordered chain that ends where the business
   ends. No forced return edge; a loop-back exists only if the user adds it.
2. Overview boxes are workflow stages (e.g. Purchase → Stock → Sell → Invoice), not
   components (mailbox, CRM, crew).
3. New company flow: short AI interview (name, industry) → AI seeds stages for that
   industry. Keep industry templates and blank canvas as alternate starting points.
4. The on-screen map is the product; exports (MD/SOP/JSON/Mermaid) are byproducts.
   Visual bar: Mermaid-clean, information-dense, every mark has a meaning, no noise.
5. Overview stays shallow. Depth is opt-in per stage; the outside view should make
   the depth legible without opening it.
6. Components (email environment, CRM/WMS, database, network, people, couriers,
   cutoff times) live inside stages; deeper detail reachable from there.
7. Modes are passes over one model, not separate tools:
   - Map mode: capture what happens today, functional or not. Ship this first.
   - SOP / automation modes (later): AI drills, pushes, challenges vague answers.
8. In Map mode the AI does not challenge in the moment. Dysfunction surfaces on the
   map itself: double entry, manual steps, missing integrations, one-person
   dependencies, disconnected tools.
9. First-sitting success = a complete end-to-end static X-ray of the company,
   dysfunction included. Not live status, not a dashboard.

## Deferred (do not touch now)
- Voice module (2.5s silence auto-send is acceptable for now; separate module later).
- Credit / pricing model.
- Export formats beyond what exists.
