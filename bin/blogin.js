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

async function run(fn) {
  try {
    const result = await fn();
    output(result);
  } catch (err) {
    if (err.status) {
      console.error(JSON.stringify(err, null, 2));
      process.exit(1);
    }
    console.error(err.message || err);
    process.exit(1);
  }
}

function paginationOpts(cmd) {
  return cmd
    .option("-p, --page <n>", "Page number (default: 1)")
    .option("-l, --limit <n>", "Results per page (min: 10, max: 100, default: 10)")
    .option("-s, --sort <field>", "Sort field (prefix with - for descending)");
}

function collectOpts(opts) {
  const o = {};
  if (opts.page) o.page = opts.page;
  if (opts.limit) o.limit = opts.limit;
  if (opts.sort) o.sort = opts.sort;
  return o;
}

// --- Program setup ---

program
  .name("blogin")
  .description(
    `CLI wrapper for the BlogIn REST API (https://blogin.co/api/rest/docs/)

All commands output JSON. Set BLOGIN_API_KEY env var or place it in .env file.

Resources: members, posts, comments, pages, categories, tags, teams, search, stats`
  )
  .version("1.0.0");

// =====================
// MEMBERS
// =====================
const members = program
  .command("members")
  .description("Manage blog members (users)");

paginationOpts(
  members
    .command("list")
    .description("List all members. Returns paginated member objects.")
).action((opts) => run(() => getClient().listMembers(collectOpts(opts))));

members
  .command("get <id>")
  .description("Get a specific member by ID.")
  .action((id) => run(() => getClient().getMember(id)));

members
  .command("create")
  .description("Create a new member. Requires --email and --username.")
  .requiredOption("--email <email>", "Member email (required)")
  .requiredOption("--username <username>", "Member username (required)")
  .option("--name <name>", "First name")
  .option("--surname <surname>", "Last name")
  .option("--access-level <level>", "Access level")
  .option("--job-title <title>", "Job title")
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
  .option("--email <email>", "Member email")
  .option("--username <username>", "Member username")
  .option("--name <name>", "First name")
  .option("--surname <surname>", "Last name")
  .option("--access-level <level>", "Access level")
  .option("--job-title <title>", "Job title")
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
  .description("Delete a member by ID.")
  .action((id) => run(() => getClient().deleteMember(id)));

members
  .command("deactivate <id>")
  .description("Deactivate a member by ID.")
  .action((id) => run(() => getClient().deactivateMember(id)));

members
  .command("activate <id>")
  .description("Activate a member by ID.")
  .action((id) => run(() => getClient().activateMember(id)));

paginationOpts(
  members
    .command("posts <id>")
    .description("List posts by a specific member.")
).action((id, opts) =>
  run(() => getClient().getMemberPosts(id, collectOpts(opts)))
);

members
  .command("teams <id>")
  .description("List teams a member belongs to.")
  .action((id) => run(() => getClient().getMemberTeams(id)));

members
  .command("assign-team <memberId> <teamId>")
  .description("Assign a member to a team.")
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
    .description("List all posts. Returns paginated post objects.")
    .option("--author <id>", "Filter by author ID")
).action((opts) => {
  const q = collectOpts(opts);
  if (opts.author) q.author = opts.author;
  return run(() => getClient().listPosts(q));
});

posts
  .command("get <id>")
  .description("Get a specific post by ID. Returns full post with HTML body.")
  .action((id) => run(() => getClient().getPost(id)));

posts
  .command("create")
  .description("Create a new post. Requires --title, --text, --author-id.")
  .requiredOption("--title <title>", "Post title (required)")
  .requiredOption("--text <html>", "Post body as HTML (required)")
  .requiredOption("--author-id <id>", "Author member ID (required)")
  .option("--published <bool>", "Published status (true/false)")
  .option("--wiki", "Mark as wiki post")
  .option("--important", "Mark as important")
  .option("--pinned", "Pin the post")
  .option("--comments-disabled", "Disable comments")
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
  .option("--text <html>", "Post body as HTML")
  .option("--author-id <authorId>", "Author member ID")
  .option("--published <bool>", "Published status (true/false)")
  .option("--wiki", "Mark as wiki post")
  .option("--important", "Mark as important")
  .option("--pinned", "Pin the post")
  .option("--comments-disabled", "Disable comments")
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
  .description("Get all tags for a specific post.")
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
    .description("List comments on a post.")
).action((postId, opts) =>
  run(() => getClient().listComments(postId, collectOpts(opts)))
);

comments
  .command("create <postId>")
  .description("Add a comment to a post. Requires --text and --author-id.")
  .requiredOption("--text <html>", "Comment body as HTML (required)")
  .requiredOption("--author-id <id>", "Author member ID (required)")
  .option("--parent <id>", "Parent comment ID (for replies)")
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
  .description("Update a comment.")
  .requiredOption("--text <html>", "Comment body as HTML (required)")
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
  pages.command("list").description("List all pages.")
).action((opts) => run(() => getClient().listPages(collectOpts(opts))));

pages
  .command("get <id>")
  .description("Get a specific page by ID.")
  .action((id) => run(() => getClient().getPage(id)));

pages
  .command("create")
  .description("Create a new page. Requires --title and --author-id.")
  .requiredOption("--title <title>", "Page title (required)")
  .requiredOption("--author-id <id>", "Author member ID (required)")
  .option("--text <html>", "Page body as HTML")
  .option("--published <bool>", "Published status (true/false)")
  .option("--position <n>", "Display position")
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
  .option("--text <html>", "Page body as HTML")
  .option("--author-id <id>", "Author member ID")
  .option("--published <bool>", "Published status (true/false)")
  .option("--position <n>", "Display position")
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
  categories.command("list").description("List all categories.")
).action((opts) => run(() => getClient().listCategories(collectOpts(opts))));

categories
  .command("get <id>")
  .description("Get a specific category by ID.")
  .action((id) => run(() => getClient().getCategory(id)));

categories
  .command("create")
  .description("Create a category. Requires --name.")
  .requiredOption("--name <name>", "Category name (required)")
  .option("--parent <id>", "Parent category ID")
  .option("--position <n>", "Display position")
  .option("--locked", "Lock the category")
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
  .option("--parent <parentId>", "Parent category ID")
  .option("--position <n>", "Display position")
  .option("--locked", "Lock the category")
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
    .description("List posts in a category.")
).action((id, opts) =>
  run(() => getClient().getCategoryPosts(id, collectOpts(opts)))
);

paginationOpts(
  categories
    .command("followers <id>")
    .description("List followers of a category.")
).action((id, opts) =>
  run(() => getClient().getCategoryFollowers(id, collectOpts(opts)))
);

// =====================
// TAGS
// =====================
const tags = program.command("tags").description("Browse tags");

paginationOpts(
  tags.command("list").description("List all tags (sorted by usage count).")
).action((opts) => run(() => getClient().listTags(collectOpts(opts))));

tags
  .command("get <id>")
  .description("Get a specific tag by ID.")
  .action((id) => run(() => getClient().getTag(id)));

// =====================
// TEAMS
// =====================
const teams = program.command("teams").description("Manage teams");

paginationOpts(
  teams.command("list").description("List all teams.")
).action((opts) => run(() => getClient().listTeams(collectOpts(opts))));

teams
  .command("get <id>")
  .description("Get a specific team by ID.")
  .action((id) => run(() => getClient().getTeam(id)));

teams
  .command("create")
  .description("Create a team. Requires --name.")
  .requiredOption("--name <name>", "Team name (required)")
  .option("--position <n>", "Display position")
  .option("--locked", "Lock the team")
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
  .option("--position <n>", "Display position")
  .option("--locked", "Lock the team")
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
    "Search posts, comments, and pages. Pass search terms as the argument."
  );
paginationOpts(search)
  .option("--comments", "Include comments in results")
  .option("--pages", "Include pages in results")
  .action((terms, opts) => {
    const q = collectOpts(opts);
    if (opts.comments) q.comments = true;
    if (opts.pages) q.pages = true;
    return run(() => getClient().search(terms, q));
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
    .description("Get post statistics.")
    .option(
      "--start-date <date>",
      "Start date YYYY-MM-DD (default: 30 days ago)"
    )
    .option("--end-date <date>", "End date YYYY-MM-DD (default: today)")
).action((opts) => {
  const q = collectOpts(opts);
  if (opts.startDate) q.start_date = opts.startDate;
  if (opts.endDate) q.end_date = opts.endDate;
  return run(() => getClient().postStats(q));
});

paginationOpts(
  stats
    .command("members")
    .description("Get member activity statistics.")
    .option(
      "--start-date <date>",
      "Start date YYYY-MM-DD (default: 30 days ago)"
    )
    .option("--end-date <date>", "End date YYYY-MM-DD (default: today)")
).action((opts) => {
  const q = collectOpts(opts);
  if (opts.startDate) q.start_date = opts.startDate;
  if (opts.endDate) q.end_date = opts.endDate;
  return run(() => getClient().memberStats(q));
});

program.parse();
