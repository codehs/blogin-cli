# blogin-cli

CLI wrapper for the [BlogIn REST API](https://blogin.co/api/rest/docs/). Designed for easy use by AI agents — all output is JSON, commands are predictable, and help text is thorough.

## Setup

```bash
npm install
npm link        # makes `blogin` available globally
```

Set your API key as an environment variable or in a `.env` file:

```bash
export BLOGIN_API_KEY=your_api_key_here
```

The CLI also reads from `../.env.local` (parent directory) automatically.

## Authentication

All requests use Bearer token auth via the `BLOGIN_API_KEY` environment variable. Generate an API key in BlogIn Settings > API tab.

## Usage

```
blogin <resource> <action> [options]
```

All commands output JSON to stdout. Errors output JSON to stderr with the API error code.

## Resources & Commands

### Members

```bash
blogin members list [--page N] [--limit N] [--sort FIELD]
blogin members get <id>
blogin members create --email <email> --username <username> [--name <name>] [--surname <surname>] [--access-level <level>] [--job-title <title>] [--phone <phone>]
blogin members update <id> [--email <email>] [--username <username>] [--name <name>] [--surname <surname>] [--access-level <level>] [--job-title <title>] [--phone <phone>]
blogin members delete <id>
blogin members deactivate <id>
blogin members activate <id>
blogin members posts <id> [--page N] [--limit N] [--sort FIELD]
blogin members teams <id>
blogin members assign-team <memberId> <teamId>
blogin members remove-team <memberId> <teamId>
```

### Posts

```bash
blogin posts list [--page N] [--limit N] [--sort FIELD] [--author <id>]
blogin posts get <id>
blogin posts create --title <title> --text <html> --author-id <id> [--published true|false] [--wiki] [--important] [--pinned] [--comments-disabled]
blogin posts update <id> [--title <title>] [--text <html>] [--author-id <id>] [--published true|false] [--wiki] [--important] [--pinned] [--comments-disabled]
blogin posts delete <id>
blogin posts tags <id>
```

### Comments

```bash
blogin comments list <postId> [--page N] [--limit N] [--sort FIELD]
blogin comments create <postId> --text <html> --author-id <id> [--parent <commentId>]
blogin comments update <postId> <commentId> --text <html> [--author-id <id>]
blogin comments delete <postId> <commentId>
```

### Pages

```bash
blogin pages list [--page N] [--limit N] [--sort FIELD]
blogin pages get <id>
blogin pages create --title <title> --author-id <id> [--text <html>] [--published true|false] [--position N]
blogin pages update <id> [--title <title>] [--text <html>] [--author-id <id>] [--published true|false] [--position N]
blogin pages delete <id>
```

### Categories

```bash
blogin categories list [--page N] [--limit N] [--sort FIELD]
blogin categories get <id>
blogin categories create --name <name> [--parent <id>] [--position N] [--locked]
blogin categories update <id> [--name <name>] [--parent <id>] [--position N] [--locked]
blogin categories delete <id>
blogin categories posts <id> [--page N] [--limit N] [--sort FIELD]
blogin categories followers <id> [--page N] [--limit N] [--sort FIELD]
```

### Tags

```bash
blogin tags list [--page N] [--limit N] [--sort FIELD]
blogin tags get <id>
```

### Teams

```bash
blogin teams list [--page N] [--limit N] [--sort FIELD]
blogin teams get <id>
blogin teams create --name <name> [--position N] [--locked]
blogin teams update <id> [--name <name>] [--position N] [--locked]
blogin teams delete <id>
```

### Search

```bash
blogin search <terms> [--page N] [--limit N] [--sort FIELD] [--comments] [--pages]
```

### Stats

```bash
blogin stats posts [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--page N] [--limit N] [--sort FIELD]
blogin stats members [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--page N] [--limit N] [--sort FIELD]
```

## Pagination

All list commands support pagination:

- `--page N` — page number (default: 1)
- `--limit N` — results per page (min: 10, max: 100, default: 10)
- `--sort FIELD` — sort field, prefix with `-` for descending (e.g., `-date_published`)

Response includes a `meta.pagination` object with `total`, `count`, `per_page`, `current_page`, `total_pages`, and `links`.

## Response Format

All successful responses are JSON objects with a `data` field (array for lists, object for single items) and a `meta` field for pagination info.

```json
{
  "data": [...],
  "meta": {
    "pagination": {
      "total": 148,
      "count": 10,
      "per_page": 10,
      "current_page": 1,
      "total_pages": 15
    }
  }
}
```

## Error Handling

Errors output JSON to stderr with status code and message:

```json
{
  "status": 404,
  "error": {
    "message": "Resource not found",
    "code": 404
  }
}
```

| Code | Meaning |
|------|---------|
| 400 | Invalid request |
| 401 | Invalid API key |
| 403 | Admin-only resource |
| 404 | Resource not found |
| 405 | Invalid HTTP method |
| 429 | Rate limit (10 req/sec) |
| 500 | Server error |

## API Reference

Base URL: `https://blogin.co/api/rest/`
Full docs: https://blogin.co/api/rest/docs/

---

## Instructions for Agents

Copy-paste the section below into a conversation with an AI agent to get it up to speed on using BlogIn through this CLI.

---

### What is BlogIn?

BlogIn (https://blogin.co) is an internal company blog platform. Teams use it to share updates, announcements, recaps, and knowledge with the rest of the organization. Think of it as a structured, searchable internal newsletter — posts are organized by categories (e.g., "Monthly Recap", "Engineering", "Sales") and teams, and people can comment and vote on posts.

Key concepts:
- **Posts** are the main content. They have an author, HTML body, categories, tags, and can be pinned/important/wiki.
- **Members** are people in the organization. Each has a role, teams, and activity history.
- **Categories** organize posts by topic (e.g., "Product", "Customer Success", "Monthly Recap").
- **Teams** represent departments or groups (e.g., "Engineering", "Marketing").
- **Tags** are freeform labels on posts.
- **Pages** are static wiki-style content (like a "Blog Guidelines" page).
- **Comments** are threaded discussions on posts.

### Setting up the CLI

The `blogin` CLI is installed at the repo `blogin-cli`. To set it up:

```bash
cd blogin-cli
npm install
npm link
```

It needs a `BLOGIN_API_KEY` environment variable. Check for it in:
- A `.env` file in the `blogin-cli/` directory
- A `.env.local` file in the parent directory

Once set up, verify it works by running:

```bash
blogin members list
```

You should get back a JSON response with member data.

### How to use the CLI

Every command follows the pattern `blogin <resource> <action> [options]` and returns JSON. Run `blogin --help` to see all resources, or `blogin <resource> --help` to see actions for a resource.

Quick orientation commands to understand the blog:

```bash
# See what categories exist
blogin categories list

# See what teams exist
blogin teams list

# See recent posts
blogin posts list

# Read a specific post
blogin posts get <id>

# See comments on a post
blogin comments list <postId>

# Search for something
blogin search "quarterly update"

# See who's been active
blogin stats members --start-date 2026-01-01
```

All list commands support `--page N`, `--limit N` (min 10, max 100), and `--sort FIELD` (prefix with `-` for descending, e.g., `-date_published`).

Post bodies use HTML for the `--text` field when creating or updating.

### Before you start — ask the user

To use BlogIn effectively on someone's behalf, you should understand their context. Ask the user:

1. **What do you use BlogIn for?** (e.g., writing monthly recaps, reading company updates, tracking team activity, managing members)
2. **What are you trying to accomplish right now?** (e.g., "draft this month's engineering recap", "summarize what the sales team posted last quarter", "find all posts about a specific topic")
3. **What is your member ID or username?** (needed if you'll be creating posts or comments on their behalf — you can look it up with `blogin members list`)
4. **Are there specific categories or teams you care about?** (helps you filter results instead of pulling everything)
5. **Should posts be published immediately or saved as drafts?** (when creating content, `--published true` makes it live right away)
