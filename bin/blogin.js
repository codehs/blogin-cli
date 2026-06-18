#!/usr/bin/env node

const path = require("path");
// Load .env from CLI project dir, then from parent dir (.env.local)
// quiet: true suppresses dotenvx marketing logs
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
  quiet: true,
});
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
  quiet: true,
});

const { Command } = require("commander");
const BlogInClient = require("../lib/client");

const program = new Command();

// --- Helpers ---

function getClient() {
  return new BlogInClient(process.env.BLOGIN_API_KEY);
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

// Agent-hints on stderr for non-interactive calls (printingpress.dev norm).
// When stdout is a TTY, the user is reading directly — keep stderr quiet.
// When piped to an agent, surface follow-up hints they can act on.
function agentHint(msg) {
  if (process.stdout.isTTY) return;
  process.stderr.write(`hint: ${msg}\n`);
}

function listHints(result, { sortHelp, command } = {}) {
  if (!result || !result.meta || !result.meta.pagination) return;
  const p = result.meta.pagination;
  if (p.total > p.count && p.current_page < p.total_pages) {
    const nextCmd = command ? `${command} --page ${p.current_page + 1}` : `--page ${p.current_page + 1}`;
    agentHint(`showing ${p.count} of ${p.total} results — next page: ${nextCmd}`);
    if (p.per_page < 100) {
      agentHint(`raise --limit up to 100 to fetch fewer pages`);
    }
  }
  if (sortHelp) agentHint(`sort options: ${sortHelp}`);
}

async function run(fn, { truncate, sortHelp, command } = {}) {
  try {
    let result = await fn();
    if (truncate && result && Array.isArray(result.data)) {
      result.data = result.data.slice(0, truncate);
      if (result.meta && result.meta.pagination) {
        result.meta.pagination.count = result.data.length;
      }
    }
    output(result);
    listHints(result, { sortHelp, command });
  } catch (err) {
    if (err.status) {
      console.error(JSON.stringify(err, null, 2));
      process.exit(1);
    }
    console.error(err.message || err);
    process.exit(1);
  }
}

function paginationOpts(cmd, { sortHelp } = {}) {
  cmd
    .option("-p, --page <n>", "Page number, starts at 1 (default: 1)")
    .option(
      "-l, --limit <n>",
      "Number of results to return, 1-100 (default: 10)"
    );
  const sortDesc = sortHelp
    ? `Sort field. Prefix with - for descending. ${sortHelp}`
    : "Sort field. Prefix with - for descending (e.g. -date_published, @id)";
  cmd.option("-s, --sort <field>", sortDesc);
  cmd._sortHelp = sortHelp;
  return cmd;
}

const API_MIN_LIMIT = 10;

function collectOpts(opts) {
  const o = {};
  if (opts.page) o.page = opts.page;
  if (opts.limit) {
    const requested = parseInt(opts.limit);
    o._truncate = requested < API_MIN_LIMIT ? requested : null;
    o.limit = Math.max(requested, API_MIN_LIMIT);
  }
  if (opts.sort) o.sort = opts.sort;
  return o;
}

function runList(fn, query, cmd) {
  const truncate = query._truncate;
  delete query._truncate;
  const sortHelp = cmd && cmd._sortHelp;
  const command = cmd ? cmdPath(cmd) : undefined;
  return run(() => fn(), { truncate, sortHelp, command });
}

function cmdPath(cmd) {
  const parts = [];
  let c = cmd;
  while (c && c.name() !== "blogin") {
    parts.unshift(c.name());
    c = c.parent;
  }
  return `blogin ${parts.join(" ")}`;
}

const ENV_PATH = path.resolve(__dirname, "../.env");

function prompt(question) {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function testApiKey(key) {
  const client = new BlogInClient(key);
  const result = await client.listMembers({ limit: 10, page: 1 });
  return result;
}

// --- Program setup ---

program
  .name("blogin")
  .description(
    `Agent-native CLI for the BlogIn REST API (https://blogin.co/api/rest/docs/)

stdout: JSON results only. stderr: errors, plus follow-up hints when piped.
Set BLOGIN_API_KEY env var or run 'blogin auth login'.

Shortcuts: recent, find
Resources: members, posts, comments, pages, categories, tags, teams, search, stats

Compound queries: 'blogin posts get <id> --with comments,tags,author' bundles
related data into a single response (avoids round-trips).
Filters: 'blogin find <terms> author:<id> category:<id>' mixes free text and
key:value filters; the CLI routes to the narrowest endpoint available.`
  )
  .version("1.0.0");

// =====================
// AUTH
// =====================
const auth = program
  .command("auth")
  .description("Check auth status or set up your API key");

auth
  .command("status", { isDefault: true })
  .description("Check if your API key is configured and valid. Tests the key against the API.")
  .action(async () => {
    const key = process.env.BLOGIN_API_KEY;
    if (!key) {
      console.error("Not authenticated. No BLOGIN_API_KEY found.");
      console.error("");
      console.error("Run 'blogin auth login' to set up your API key.");
      console.error("You can generate one in BlogIn → Settings → API tab.");
      process.exit(1);
    }

    try {
      const result = await testApiKey(key);
      const total = result.meta.pagination.total;
      const source = require("fs").existsSync(ENV_PATH)
        && require("fs").readFileSync(ENV_PATH, "utf8").includes("BLOGIN_API_KEY")
        ? ENV_PATH
        : "environment variable or parent .env.local";
      console.log(`Authenticated. API key is valid.`);
      console.log(`Source: ${source}`);
      console.log(`Organization has ${total} members.`);
    } catch (err) {
      console.error("API key found but is invalid or expired.");
      console.error("");
      if (err.status === 401) {
        console.error("The API returned 401 Unauthorized.");
      } else {
        console.error(`Error: ${JSON.stringify(err)}`);
      }
      console.error("Run 'blogin auth login' to set a new key.");
      process.exit(1);
    }
  });

auth
  .command("login")
  .description("Set up your API key. Prompts for the key, validates it, and saves to .env.")
  .action(async () => {
    const fs = require("fs");

    console.error("BlogIn API Key Setup");
    console.error("Generate an API key in BlogIn → Settings → API tab.");
    console.error("");

    const key = await prompt("Paste your API key: ");
    if (!key) {
      console.error("No key provided. Aborting.");
      process.exit(1);
    }

    console.error("Testing key...");
    try {
      const result = await testApiKey(key);
      const total = result.meta.pagination.total;
      console.error(`Key is valid. Organization has ${total} members.`);
    } catch (err) {
      if (err.status === 401) {
        console.error("Invalid API key. The API returned 401 Unauthorized.");
      } else {
        console.error(`Key validation failed: ${JSON.stringify(err)}`);
      }
      process.exit(1);
    }

    // Read existing .env or start fresh
    let envContent = "";
    if (fs.existsSync(ENV_PATH)) {
      envContent = fs.readFileSync(ENV_PATH, "utf8");
    }

    // Replace existing key or append
    if (envContent.match(/^BLOGIN_API_KEY=.*/m)) {
      envContent = envContent.replace(
        /^BLOGIN_API_KEY=.*/m,
        `BLOGIN_API_KEY=${key}`
      );
    } else {
      if (envContent && !envContent.endsWith("\n")) envContent += "\n";
      envContent += `BLOGIN_API_KEY=${key}\n`;
    }

    fs.writeFileSync(ENV_PATH, envContent);
    console.error("");
    console.error(`Saved to ${ENV_PATH}`);
    console.error("You're all set! Try: blogin posts list -l 3");
  });

auth
  .command("logout")
  .description("Remove your saved API key from .env.")
  .action(() => {
    const fs = require("fs");

    if (!fs.existsSync(ENV_PATH)) {
      console.error("No .env file found. Nothing to remove.");
      process.exit(0);
    }

    let envContent = fs.readFileSync(ENV_PATH, "utf8");
    if (!envContent.match(/^BLOGIN_API_KEY=.*/m)) {
      console.error("No BLOGIN_API_KEY found in .env. Nothing to remove.");
      process.exit(0);
    }

    envContent = envContent.replace(/^BLOGIN_API_KEY=.*\n?/m, "");
    fs.writeFileSync(ENV_PATH, envContent);
    console.log("API key removed from .env.");
  });

// =====================
// SHORTCUTS (top-level verbs for common patterns)
// =====================

program
  .command("recent")
  .description("Shortcut: newest posts. Equivalent to 'posts list -s -date_published'.")
  .option("-l, --limit <n>", "Number of posts to return, 1-100 (default: 10)")
  .option("-p, --page <n>", "Page number, starts at 1 (default: 1)")
  .action((opts, cmd) => {
    const q = collectOpts(opts);
    q.sort = "-date_published";
    cmd._sortHelp = "Default: -date_published (newest first)";
    return runList(() => getClient().listPosts(q), q, cmd);
  });

const find = program
  .command("find <terms...>")
  .description(
    "Natural-language search. Mix free text with key:value filters: author:<id>, category:<id>. Routes to the narrowest endpoint available."
  );
paginationOpts(find, { sortHelp: "Default depends on routed endpoint" })
  .option("--comments", "Also search within post comments")
  .option("--pages", "Also search within static pages")
  .action((terms, opts, cmd) => {
    const filters = {};
    const free = [];
    for (const t of terms) {
      const m = t.match(/^(author|category):(.+)$/);
      if (m) filters[m[1]] = m[2];
      else free.push(t);
    }
    const q = collectOpts(opts);

    // Route to the narrowest endpoint when only a filter is given.
    if (filters.category && free.length === 0) {
      return runList(
        () => getClient().getCategoryPosts(filters.category, q),
        q,
        cmd
      );
    }
    if (filters.author && free.length === 0) {
      q.author = filters.author;
      return runList(() => getClient().listPosts(q), q, cmd);
    }
    if (free.length === 0) {
      console.error(
        "error: provide search terms or a filter (e.g. find quarterly, find author:42, find category:3)"
      );
      process.exit(1);
    }
    if (filters.author) q.author = filters.author;
    if (opts.comments) q.comments = true;
    if (opts.pages) q.pages = true;
    return runList(() => getClient().search(free.join(" "), q), q, cmd);
  });

// =====================
// MEMBERS
// =====================
const members = program
  .command("members")
  .description("Manage blog members (users)");

paginationOpts(
  members
    .command("list")
    .description("List all members. Returns paginated member objects."),
  { sortHelp: "Fields: @id, name, surname, email, time_registered (default: @id)" }
).action((opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().listMembers(q), q, cmd); });

members
  .command("get <id>")
  .description("Get a specific member by ID.")
  .action((id) => run(() => getClient().getMember(id)));

members
  .command("create")
  .description("Create a new member. Requires --email and --username.")
  .requiredOption("--email <email>", "Member email address (required)")
  .requiredOption("--username <username>", "Unique username for the member (required)")
  .option("--name <name>", "First name")
  .option("--surname <surname>", "Last name")
  .option("--access-level <level>", "10 = regular member, 20 = admin")
  .option("--job-title <title>", "Job title displayed on profile")
  .option("--phone <phone>", "Phone number")
  .action((opts) => {
    const body = { email: opts.email, username: opts.username };
    if (opts.name) body.name = opts.name;
    if (opts.surname) body.surname = opts.surname;
    if (opts.accessLevel) body.access_level = opts.accessLevel;
    if (opts.jobTitle) body.job_title = opts.jobTitle;
    if (opts.phone) body.phone = opts.phone;
    return run(() => getClient().createMember(body));
  });

members
  .command("update <id>")
  .description("Update an existing member by ID.")
  .option("--email <email>", "Member email address")
  .option("--username <username>", "Unique username")
  .option("--name <name>", "First name")
  .option("--surname <surname>", "Last name")
  .option("--access-level <level>", "10 = regular member, 20 = admin")
  .option("--job-title <title>", "Job title displayed on profile")
  .option("--phone <phone>", "Phone number")
  .action((id, opts) => {
    const body = {};
    if (opts.email) body.email = opts.email;
    if (opts.username) body.username = opts.username;
    if (opts.name) body.name = opts.name;
    if (opts.surname) body.surname = opts.surname;
    if (opts.accessLevel) body.access_level = opts.accessLevel;
    if (opts.jobTitle) body.job_title = opts.jobTitle;
    if (opts.phone) body.phone = opts.phone;
    return run(() => getClient().updateMember(id, body));
  });

members
  .command("delete <id>")
  .description("Permanently delete a member by ID.")
  .action((id) => run(() => getClient().deleteMember(id)));

members
  .command("deactivate <id>")
  .description("Deactivate a member (revokes access, preserves data).")
  .action((id) => run(() => getClient().deactivateMember(id)));

members
  .command("activate <id>")
  .description("Re-activate a previously deactivated member.")
  .action((id) => run(() => getClient().activateMember(id)));

paginationOpts(
  members
    .command("posts <id>")
    .description("List posts authored by a specific member."),
  { sortHelp: "Default: -date_published (newest first)" }
).action((id, opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().getMemberPosts(id, q), q, cmd); });

members
  .command("teams <id>")
  .description("List teams a member belongs to. Returns team id, name, position.")
  .action((id) => run(() => getClient().getMemberTeams(id)));

members
  .command("assign-team <memberId> <teamId>")
  .description("Add a member to a team. Get team IDs from 'blogin teams list'.")
  .action((memberId, teamId) =>
    run(() => getClient().assignMemberTeam(memberId, teamId))
  );

members
  .command("remove-team <memberId> <teamId>")
  .description("Remove a member from a team.")
  .action((memberId, teamId) =>
    run(() => getClient().removeMemberTeam(memberId, teamId))
  );

// =====================
// POSTS
// =====================
const posts = program.command("posts").description("Manage blog posts");

paginationOpts(
  posts
    .command("list")
    .description("List all posts. Returns title, author, date, categories, vote/comment counts.")
    .option("--author <id>", "Filter to posts by this member ID only"),
  { sortHelp: "Default: -date_published (newest first)" }
).action((opts, cmd) => {
  const q = collectOpts(opts);
  if (opts.author) q.author = opts.author;
  return runList(() => getClient().listPosts(q), q, cmd);
});

posts
  .command("get <id>")
  .description("Get a specific post by ID. Returns full post including HTML body, author, categories, tags, votes, and comment count.")
  .option(
    "--with <resources>",
    "Comma-separated extras to bundle into one response: comments, tags, author. Avoids extra round-trips."
  )
  .action((id, opts) => {
    const extras = opts.with
      ? opts.with.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    if (extras.length === 0) {
      return run(() => getClient().getPost(id));
    }
    return run(async () => {
      const client = getClient();
      const post = await client.getPost(id);
      const tasks = [];
      if (extras.includes("comments")) {
        tasks.push(
          client.listComments(id, { limit: 100, page: 1 }).then((r) => {
            post.data.comments = r.data;
            post.data.comments_meta = r.meta;
          })
        );
      }
      if (extras.includes("tags")) {
        tasks.push(
          client.getPostTags(id).then((r) => {
            post.data.tags = r.data;
          })
        );
      }
      if (extras.includes("author") && post.data && post.data.author && post.data.author.id) {
        tasks.push(
          client.getMember(post.data.author.id).then((r) => {
            post.data.author = r.data;
          })
        );
      }
      await Promise.all(tasks);
      return post;
    });
  });

posts
  .command("create")
  .description("Create a new post. Requires --title, --text, --author-id.")
  .requiredOption("--title <title>", "Post title (required)")
  .requiredOption("--text <html>", "Post body as HTML string (required). Wrap in quotes.")
  .requiredOption("--author-id <id>", "Author member ID (required). Get IDs from 'blogin members list'.")
  .option("--published <bool>", "true = visible to all, false = draft (default: true)")
  .option("--wiki", "Mark as wiki post (collaboratively editable by members)")
  .option("--important", "Mark as important (highlighted in feed, triggers notifications)")
  .option("--pinned", "Pin to top of the post feed")
  .option("--comments-disabled", "Prevent members from commenting on this post")
  .action((opts) => {
    const body = {
      title: opts.title,
      text: opts.text,
      author: { id: parseInt(opts.authorId) },
    };
    if (opts.published !== undefined)
      body.published = opts.published === "true";
    if (opts.wiki) body.wiki = true;
    if (opts.important) body.important = true;
    if (opts.pinned) body.pinned = true;
    if (opts.commentsDisabled) body.comments_disabled = true;
    return run(() => getClient().createPost(body));
  });

posts
  .command("update <id>")
  .description("Update an existing post by ID.")
  .option("--title <title>", "Post title")
  .option("--text <html>", "Post body as HTML string. Wrap in quotes.")
  .option("--author-id <authorId>", "Author member ID")
  .option("--published <bool>", "true = visible to all, false = draft")
  .option("--wiki", "Mark as wiki post (collaboratively editable by members)")
  .option("--important", "Mark as important (highlighted in feed, triggers notifications)")
  .option("--pinned", "Pin to top of the post feed")
  .option("--comments-disabled", "Prevent members from commenting on this post")
  .action((id, opts) => {
    const body = {};
    if (opts.title) body.title = opts.title;
    if (opts.text) body.text = opts.text;
    if (opts.authorId) body.author = { id: parseInt(opts.authorId) };
    if (opts.published !== undefined)
      body.published = opts.published === "true";
    if (opts.wiki) body.wiki = true;
    if (opts.important) body.important = true;
    if (opts.pinned) body.pinned = true;
    if (opts.commentsDisabled) body.comments_disabled = true;
    return run(() => getClient().updatePost(id, body));
  });

posts
  .command("delete <id>")
  .description("Delete a post by ID.")
  .action((id) => run(() => getClient().deletePost(id)));

posts
  .command("tags <id>")
  .description("Get all tags for a specific post. Returns tag id, name, and slug.")
  .action((id) => run(() => getClient().getPostTags(id)));

// =====================
// COMMENTS
// =====================
const comments = program
  .command("comments")
  .description("Manage post comments");

paginationOpts(
  comments
    .command("list <postId>")
    .description("List comments on a post. Returns comment text, author, parent (for threads), and votes."),
  { sortHelp: "Default: @id (oldest first). Use -@id for newest first." }
).action((postId, opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().listComments(postId, q), q, cmd); });

comments
  .command("create <postId>")
  .description("Add a comment to a post. Requires --text and --author-id.")
  .requiredOption("--text <html>", "Comment body as HTML string (required). Wrap in quotes.")
  .requiredOption("--author-id <id>", "Author member ID (required). Get IDs from 'blogin members list'.")
  .option("--parent <id>", "Parent comment ID to reply to (creates a threaded reply)")
  .action((postId, opts) => {
    const body = {
      text: opts.text,
      author: { id: parseInt(opts.authorId) },
    };
    if (opts.parent) body.parent = parseInt(opts.parent);
    return run(() => getClient().createComment(postId, body));
  });

comments
  .command("update <postId> <commentId>")
  .description("Update comment text. Requires the post ID and comment ID.")
  .requiredOption("--text <html>", "New comment body as HTML string (required). Wrap in quotes.")
  .option("--author-id <id>", "Author member ID")
  .action((postId, commentId, opts) => {
    const body = { text: opts.text };
    if (opts.authorId) body.author = { id: parseInt(opts.authorId) };
    return run(() => getClient().updateComment(postId, commentId, body));
  });

comments
  .command("delete <postId> <commentId>")
  .description("Delete a comment.")
  .action((postId, commentId) =>
    run(() => getClient().deleteComment(postId, commentId))
  );

// =====================
// PAGES
// =====================
const pages = program.command("pages").description("Manage static pages");

paginationOpts(
  pages
    .command("list")
    .description("List all static pages. Returns title, author, and position."),
  { sortHelp: "Default: @position (display order)" }
).action((opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().listPages(q), q, cmd); });

pages
  .command("get <id>")
  .description("Get a specific page by ID. Returns full page including HTML body.")
  .action((id) => run(() => getClient().getPage(id)));

pages
  .command("create")
  .description("Create a new page. Requires --title and --author-id.")
  .requiredOption("--title <title>", "Page title (required)")
  .requiredOption("--author-id <id>", "Author member ID (required). Get IDs from 'blogin members list'.")
  .option("--text <html>", "Page body as HTML string. Wrap in quotes.")
  .option("--published <bool>", "true = visible to all, false = draft (default: true)")
  .option("--position <n>", "Display order among pages (lower = earlier, integer)")
  .action((opts) => {
    const body = {
      title: opts.title,
      author: { id: parseInt(opts.authorId) },
    };
    if (opts.text) body.text = opts.text;
    if (opts.published !== undefined)
      body.published = opts.published === "true";
    if (opts.position) body.position = parseInt(opts.position);
    return run(() => getClient().createPage(body));
  });

pages
  .command("update <id>")
  .description("Update an existing page by ID.")
  .option("--title <title>", "Page title")
  .option("--text <html>", "Page body as HTML string. Wrap in quotes.")
  .option("--author-id <id>", "Author member ID")
  .option("--published <bool>", "true = visible to all, false = draft")
  .option("--position <n>", "Display order among pages (lower = earlier, integer)")
  .action((id, opts) => {
    const body = {};
    if (opts.title) body.title = opts.title;
    if (opts.text) body.text = opts.text;
    if (opts.authorId) body.author = { id: parseInt(opts.authorId) };
    if (opts.published !== undefined)
      body.published = opts.published === "true";
    if (opts.position) body.position = parseInt(opts.position);
    return run(() => getClient().updatePage(id, body));
  });

pages
  .command("delete <id>")
  .description("Delete a page by ID.")
  .action((id) => run(() => getClient().deletePage(id)));

// =====================
// CATEGORIES
// =====================
const categories = program
  .command("categories")
  .description("Manage post categories");

paginationOpts(
  categories
    .command("list")
    .description("List all categories. Returns id, name, parent (0 = top-level), position, locked status."),
  { sortHelp: "Default: @position (display order)" }
).action((opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().listCategories(q), q, cmd); });

categories
  .command("get <id>")
  .description("Get a specific category by ID.")
  .action((id) => run(() => getClient().getCategory(id)));

categories
  .command("create")
  .description("Create a category. Requires --name.")
  .requiredOption("--name <name>", "Category name (required)")
  .option("--parent <id>", "Parent category ID for nesting (0 or omit for top-level)")
  .option("--position <n>", "Display order among categories (lower = earlier, integer)")
  .option("--locked", "Lock category so only admins can post to it")
  .action((opts) => {
    const body = { name: opts.name };
    if (opts.parent) body.parent = parseInt(opts.parent);
    if (opts.position) body.position = parseInt(opts.position);
    if (opts.locked) body.locked = true;
    return run(() => getClient().createCategory(body));
  });

categories
  .command("update <id>")
  .description("Update a category by ID.")
  .option("--name <name>", "Category name")
  .option("--parent <parentId>", "Parent category ID for nesting (0 for top-level)")
  .option("--position <n>", "Display order among categories (lower = earlier, integer)")
  .option("--locked", "Lock category so only admins can post to it")
  .action((id, opts) => {
    const body = {};
    if (opts.name) body.name = opts.name;
    if (opts.parent) body.parent = parseInt(opts.parent);
    if (opts.position) body.position = parseInt(opts.position);
    if (opts.locked) body.locked = true;
    return run(() => getClient().updateCategory(id, body));
  });

categories
  .command("delete <id>")
  .description("Delete a category by ID.")
  .action((id) => run(() => getClient().deleteCategory(id)));

paginationOpts(
  categories
    .command("posts <id>")
    .description("List posts in a category. Same fields as 'posts list'."),
  { sortHelp: "Default: -date_published (newest first)" }
).action((id, opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().getCategoryPosts(id, q), q, cmd); });

paginationOpts(
  categories
    .command("followers <id>")
    .description("List members who follow a category (receive notifications for new posts).")
).action((id, opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().getCategoryFollowers(id, q), q, cmd); });

// =====================
// TAGS
// =====================
const tags = program.command("tags").description("Browse tags");

paginationOpts(
  tags
    .command("list")
    .description("List all tags. Returns id, name, slug, and count (number of posts using this tag)."),
  { sortHelp: "Default: -count (most used first)" }
).action((opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().listTags(q), q, cmd); });

tags
  .command("get <id>")
  .description("Get a specific tag by ID. Returns id, name, and slug.")
  .action((id) => run(() => getClient().getTag(id)));

// =====================
// TEAMS
// =====================
const teams = program.command("teams").description("Manage teams");

paginationOpts(
  teams
    .command("list")
    .description("List all teams. Returns id, name, position, locked, and sso_managed status."),
  { sortHelp: "Default: @position (display order)" }
).action((opts, cmd) => { const q = collectOpts(opts); runList(() => getClient().listTeams(q), q, cmd); });

teams
  .command("get <id>")
  .description("Get a specific team by ID. Returns id, name, position, locked, and sso_managed status.")
  .action((id) => run(() => getClient().getTeam(id)));

teams
  .command("create")
  .description("Create a team. Requires --name.")
  .requiredOption("--name <name>", "Team name (required)")
  .option("--position <n>", "Display order among teams (lower = earlier, integer)")
  .option("--locked", "Lock team so only admins can modify membership")
  .action((opts) => {
    const body = { name: opts.name };
    if (opts.position) body.position = parseInt(opts.position);
    if (opts.locked) body.locked = true;
    return run(() => getClient().createTeam(body));
  });

teams
  .command("update <id>")
  .description("Update a team by ID.")
  .option("--name <name>", "Team name")
  .option("--position <n>", "Display order among teams (lower = earlier, integer)")
  .option("--locked", "Lock team so only admins can modify membership")
  .action((id, opts) => {
    const body = {};
    if (opts.name) body.name = opts.name;
    if (opts.position) body.position = parseInt(opts.position);
    if (opts.locked) body.locked = true;
    return run(() => getClient().updateTeam(id, body));
  });

teams
  .command("delete <id>")
  .description("Delete a team by ID.")
  .action((id) => run(() => getClient().deleteTeam(id)));

// =====================
// SEARCH
// =====================
const search = program
  .command("search <terms>")
  .description(
    "Full-text search across posts. Returns resourceType, id, title, author, date. By default only searches posts; use --comments and --pages to include those."
  );
paginationOpts(search)
  .option("--comments", "Also search within post comments")
  .option("--pages", "Also search within static pages")
  .action((terms, opts, cmd) => {
    const q = collectOpts(opts);
    if (opts.comments) q.comments = true;
    if (opts.pages) q.pages = true;
    return runList(() => getClient().search(terms, q), q, cmd);
  });

// =====================
// STATS
// =====================
const stats = program
  .command("stats")
  .description("View blog statistics (posts and members)");

paginationOpts(
  stats
    .command("posts")
    .description("Get post statistics: total posts, posts/week, comments, engaged users, views, and votes. Includes per-post breakdown with view counts.")
    .option(
      "--start-date <date>",
      "Start of date range, YYYY-MM-DD (default: 30 days ago)"
    )
    .option("--end-date <date>", "End of date range, YYYY-MM-DD (default: today)"),
  { sortHelp: "Default: -date_published. Also: -post_views, -comments, -upVoteNum" }
).action((opts) => {
  const q = collectOpts(opts);
  if (opts.startDate) q.start_date = opts.startDate;
  if (opts.endDate) q.end_date = opts.endDate;
  delete q._truncate;
  return run(() => getClient().postStats(q));
});

paginationOpts(
  stats
    .command("members")
    .description("Get member activity statistics: posts written, comments made, post views, and logins per member.")
    .option(
      "--start-date <date>",
      "Start of date range, YYYY-MM-DD (default: 30 days ago)"
    )
    .option("--end-date <date>", "End of date range, YYYY-MM-DD (default: today)"),
  { sortHelp: "Default: -posts. Also: -comments, -post_views, -logins" }
).action((opts) => {
  const q = collectOpts(opts);
  if (opts.startDate) q.start_date = opts.startDate;
  if (opts.endDate) q.end_date = opts.endDate;
  delete q._truncate;
  return run(() => getClient().memberStats(q));
});

program.parse();
