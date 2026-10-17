# AGENTS.md

## CRITICAL INSTRUCTIONS

These rules are mandatory for all work in this project.

Before modifying, creating, or deleting code:

1. Read this "AGENTS.md".
2. Understand the relevant existing project structure and conventions.
3. Read ".ai/context.md" if it exists.
4. Read ".ai/decisions.md" when the task involves architectural or technical decisions.
5. Read ".ai/gotchas.md" when the task touches an area covered by known issues or constraints.
6. Inspect only the source files relevant to the requested task before making changes.

Do not modify code before understanding the applicable project rules.

Do not treat personal coding preferences as a reason to override existing project conventions.

---

## 1. Core Engineering Principles

Prioritize:

1. Correctness
2. Simplicity
3. Readability
4. Maintainability
5. Security
6. Consistency with the existing project

Prefer the simplest implementation that correctly solves the problem.

Do not introduce complexity without a concrete reason.

Avoid:

- premature abstraction
- unnecessary design patterns
- unnecessary layers
- unnecessary dependencies
- unnecessary helper functions
- unnecessary wrappers
- unnecessary refactoring

---

## 2. CODE COMMENTS — STRICT

Default: ZERO COMMENTS

Do not add comments to code by default.

Do not add comments merely to describe what the code does.

Do not add comments to make code appear more documented or professional.

Important code does NOT automatically require comments.

New functions do NOT automatically require comments.

Complex code does NOT automatically require comments.

Never write comments like:

// Get user
const user = await getUser(id)

// Check if user exists
if (!user) {
  return null
}

// Loop through users
for (const user of users) {
  ...
}

// Handle error
catch (error) {
  ...
}

// Return the result
return result

These comments are forbidden because the code already communicates the same information.

Do not automatically generate:

- JSDoc
- docstrings
- function comments
- class comments
- component comments
- inline explanatory comments

### 2.1 When Comments Are Allowed

A comment is allowed only when it explains information that cannot reasonably be expressed through code structure, naming, types, or configuration.

Valid reasons include:

- non-obvious WHY
- external constraints
- compatibility requirements
- framework/runtime/library limitations
- security considerations
- non-obvious business rules
- complex algorithms
- deliberate unusual implementation choices
- temporary workarounds

Example:

// Safari < 17 does not expose this API on the worker context.

Example:

// Keep this order because the payment provider validates the signature
// against the exact serialized field order.

Comments should explain WHY, not WHAT.

### 2.2 Prefer Code Over Comments

When something is unclear, improve the code before adding a comment.

Prefer:

const requestTimeoutMs = 5_000

over:

// Timeout in milliseconds.
const timeout = 5_000

Prefer:

const expiredSessions = sessions.filter(isSessionExpired)

over:

// Filter expired sessions.
const result = sessions.filter(...)

Good names, types, and structure should make ordinary code self-explanatory.

### 2.3 Comment Decision Rule

Before adding any comment, ask:

«Can this information be expressed through better naming, types, structure, or configuration?»

If yes, improve the code instead.

Then ask:

«Does this comment explain non-obvious information that a competent developer could not reasonably infer from the code?»

If no, do not add the comment.

When uncertain:

DO NOT ADD THE COMMENT.

---

## 3. Language and Ecosystem Standards

Use the idiomatic and established standards of the language and ecosystem being used.

Do not apply conventions from another language.

Examples:

- TypeScript/JavaScript → use idiomatic TypeScript/JavaScript.
- Python → use idiomatic Python.
- Go → use idiomatic Go.
- Rust → use idiomatic Rust.
- Java → follow established Java conventions.
- C# → follow established .NET/C# conventions.
- PHP → follow established PHP conventions.
- Other languages → follow their established ecosystem standards.

Existing project configuration takes precedence over generic preferences.

Respect existing:

- formatter
- linter
- compiler configuration
- type checker
- test framework
- package manager
- module system
- directory structure
- naming conventions

Do not introduce a new style when the project already has a consistent one.

---

## 4. Existing Codebase Conventions

Before implementing a feature, inspect nearby relevant code.

Follow existing patterns when they are reasonable.

Do not rewrite existing architecture simply because another approach is personally preferred.

Do not perform unrelated cleanup.

Do not introduce a new pattern for a single feature when an existing project pattern already solves the problem.

Consistency matters.

---

## 5. Naming

Use names that communicate intent.

Prefer names such as:

- "getUserById"
- "requestTimeoutMs"
- "calculateInvoiceTotal"
- "isAuthenticated"
- "expiredSessions"

Avoid vague names such as:

- "data"
- "value"
- "thing"
- "item"
- "temp"
- "result"
- "obj"
- "stuff"
- "handle"
- "process"

Avoid abbreviations unless they are standard in the project or ecosystem.

Use names that reduce the need for comments.

---

## 6. Functions

Functions should have a clear responsibility.

Avoid:

- giant functions
- excessive nesting
- duplicated logic
- unrelated responsibilities
- unnecessary callbacks
- unnecessary wrappers

Extract a function when it improves:

- readability
- reuse
- testability
- separation of responsibility
- domain clarity

Do not split every few lines into a function merely to make the code look clean.

Avoid functions whose only purpose is forwarding arguments without adding meaningful behavior.

---

## 7. Abstraction

Do not abstract code prematurely.

Before introducing an abstraction, determine whether it provides a real benefit.

Avoid:

- one-use generic utilities
- unnecessary interfaces
- unnecessary base classes
- unnecessary factories
- unnecessary repositories
- unnecessary service layers
- unnecessary dependency injection
- unnecessary wrappers

Prefer direct code when direct code is clearer.

Introduce abstraction when there is a concrete reason such as:

- repeated behavior
- meaningful domain boundary
- testability
- replaceable implementation
- architectural requirement
- clear separation of responsibility

Do not create abstractions merely because they are theoretically reusable.

---

## 8. Type Safety

Use strong and appropriate types.

Avoid unnecessary:

- "any"
- unsafe casts
- type suppression
- duplicated types
- overly broad types

Do not weaken types just to make the compiler accept the implementation.

Prefer precise types that communicate valid states.

Use runtime validation when data crosses a trust boundary.

---

## 9. Error Handling

Handle errors intentionally.

Do not:

- silently swallow errors
- catch errors without handling or rethrowing them
- hide useful error context
- use generic fallbacks that conceal failures
- expose internal implementation details to users

Follow the project's existing error-handling patterns.

Do not introduce a new error-handling architecture for a small feature.

---

## 10. Input Validation and Security

Treat external input as untrusted.

Validate input at appropriate boundaries.

Pay particular attention to:

- authentication
- authorization
- user input
- API input
- file paths
- uploaded files
- database queries
- shell commands
- URLs
- serialized data
- environment variables
- external API responses

Never hardcode:

- passwords
- API keys
- access tokens
- private keys
- credentials

Do not expose secrets or sensitive internal information through:

- logs
- error messages
- API responses
- source code

Prefer secure defaults.

---

## 11. Dependencies

Before adding a dependency, check whether:

1. Existing project code already provides the functionality.
2. The language standard library provides the functionality.
3. An existing dependency can provide it.

Avoid adding dependencies for trivial functionality.

Consider:

- maintenance cost
- security
- bundle size
- runtime cost
- compatibility
- project conventions

Do not add a dependency without a concrete benefit.

---

## 12. Architecture

Keep responsibilities separated where separation provides real value.

Common boundaries may include:

- presentation
- transport
- business logic
- persistence
- configuration
- external integrations

Do not introduce architectural layers merely for theoretical cleanliness.

Match architecture to the actual complexity of the project.

Prefer a simple architecture that can evolve naturally.

---

## 13. Data and Database

Follow existing database and persistence conventions.

Be careful with:

- schema changes
- migrations
- transactions
- indexes
- constraints
- nullability
- concurrent updates
- data integrity

Never silently discard or overwrite existing data.

Do not modify schemas or migrations casually.

For destructive operations, verify the intended behavior before implementation.

---

## 14. Dates, Times, and Units

Be explicit when a value could be ambiguous.

Prefer names such as:

- "timeoutMs"
- "durationSeconds"
- "createdAt"
- "expiresAt"

over ambiguous names such as:

- "timeout"
- "duration"
- "time"

Handle timezone and date semantics deliberately.

Do not assume local time or UTC without checking project requirements.

---

## 15. Performance

Do not optimize prematurely.

Prefer clear and correct code unless there is evidence that performance matters.

When performance is relevant:

1. Identify the actual bottleneck.
2. Measure when practical.
3. Optimize the relevant part.
4. Keep the resulting implementation understandable.

Do not introduce:

- caching
- memoization
- concurrency
- batching
- complex data structures
- premature database optimization

without a concrete reason.

---

## 16. Testing

Add or update tests when the change affects behavior that should be verified.

Prefer tests that validate meaningful behavior rather than implementation details.

Do not write tests solely to increase coverage numbers.

When practical, run the relevant:

- formatter
- linter
- type checker
- unit tests
- integration tests

Never claim that a command was run if it was not actually run.

If tests cannot be run, state that clearly.

---

## 17. Scope of Changes

Keep changes focused on the requested task.

Do not perform unrelated:

- refactors
- formatting changes
- dependency upgrades
- file reorganizations
- renaming
- cleanup

unless they are necessary for the task.

If an unrelated problem is discovered, mention it instead of silently expanding scope.

---

## 18. Existing Comments

Do not rewrite or remove useful existing comments without a reason.

When modifying nearby code:

- preserve comments that explain non-obvious behavior
- remove redundant comments only when directly related to the modified code
- do not perform project-wide comment cleanup unless explicitly requested

Do not copy low-quality comment patterns into new code.

Existing comments are not automatically evidence that new comments are required.

---

## 19. AI Slop Prevention

Do not generate code that exists primarily to look helpful.

Avoid:

- redundant comments
- verbose JSDoc
- unnecessary abstractions
- unnecessary helper functions
- unnecessary wrappers
- unnecessary interfaces
- unnecessary defensive checks
- unnecessary validation
- repetitive code
- boilerplate with no value
- excessive error handling without a real failure mode
- unnecessary file creation
- unnecessary refactoring

Prefer concise, direct, idiomatic code.

Every added line should have a purpose.

---

## 20. Project Memory

If ".ai/" exists, use it as project memory.

".ai/context.md"

Contains current project state, architecture, important features, and current status.

Read it when the task requires broader project context.

Update it when the current project state materially changes.

Do not turn it into a development diary.

".ai/decisions.md"

Contains durable architectural and technical decisions.

Read it before making decisions that could conflict with previous decisions.

Add an entry only when a meaningful durable decision is made.

Do not record trivial implementation details.

".ai/gotchas.md"

Contains real non-obvious bugs, edge cases, constraints, failed approaches, and important implementation pitfalls.

Add an entry only when a real reusable gotcha is discovered.

Do not create artificial gotchas.

An empty "gotchas.md" is valid.

---

## 21. Working With Existing Code

Do not assume existing code is wrong merely because it could be written differently.

When modifying existing code:

1. Understand why it exists.
2. Identify its surrounding dependencies.
3. Make the smallest reasonable change.
4. Preserve unrelated behavior.
5. Avoid opportunistic refactoring.

If a larger refactor is genuinely required, keep it explicit and focused.

---

## 22. Generated Code

If code is generated by a tool, framework, compiler, or external process:

- follow the project's generation mechanism
- do not manually modify generated files unless required
- do not add manual comments to generated output
- do not replace generated patterns with personal preferences

Prefer changing the source/template/configuration that produces the generated code.

---

## 23. Before Finishing

Before considering the task complete:

1. Verify the requested behavior.
2. Check for unintended changes.
3. Check types and error handling.
4. Check security-sensitive areas.
5. Run relevant validation when available.
6. Review the diff.
7. Review newly added comments.

For every new comment, ask:

«Does this explain something that cannot reasonably be understood from the code itself?»

If no, remove it.

If uncertain, remove it.

---

## 24. Final Review

Before responding to the user, confirm:

- The requested task was implemented.
- Existing project conventions were respected.
- No unnecessary abstraction was introduced.
- No unnecessary dependency was introduced.
- No unrelated files were modified.
- No unnecessary comments were added.
- Relevant tests or checks were run when possible.
- Project memory was updated only when durable knowledge was created.
- You do not claim to have performed actions that were not actually performed.

---

## 25. Rule Priority

When rules conflict, use this priority:

1. Explicit user requirements
2. Project-specific instructions
3. Existing project conventions
4. Language and ecosystem standards
5. General engineering preferences

Never override an explicit user requirement with a personal preference.

---

## 26. Definition of Done

A task is done when:

- the requested behavior works
- the implementation follows project conventions
- the implementation follows these rules
- the code is as simple as reasonably possible
- no unnecessary comments were added
- no unnecessary abstractions were introduced
- no unnecessary dependencies were introduced
- relevant validation was performed when possible
- unrelated code was left untouched
- durable project knowledge was recorded in ".ai/" only when necessary
