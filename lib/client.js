const https = require("https");
const { URL } = require("url");

const BASE_URL = "https://blogin.co/api/rest";

class BlogInClient {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error(
        "BLOGIN_API_KEY is required. Set it as an environment variable or in a .env file."
      );
    }
    this.apiKey = apiKey;
  }

  _request(method, path, { query, body } = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${BASE_URL}${path}`);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null) url.searchParams.set(k, v);
        }
      }

      const payload = body ? JSON.stringify(body) : null;
      const options = {
        method,
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      };
      if (payload) {
        options.headers["Content-Type"] = "application/json";
        options.headers["Content-Length"] = Buffer.byteLength(payload);
      }

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject({
                status: res.statusCode,
                error: parsed,
              });
            } else {
              resolve(parsed);
            }
          } catch {
            if (res.statusCode >= 400) {
              reject({ status: res.statusCode, error: data });
            } else {
              resolve(data);
            }
          }
        });
      });

      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  get(path, query) {
    return this._request("GET", path, { query });
  }

  post(path, body) {
    return this._request("POST", path, { body });
  }

  delete(path) {
    return this._request("DELETE", path);
  }

  // --- Members ---
  listMembers(opts = {}) {
    return this.get("/members", opts);
  }
  getMember(id) {
    return this.get(`/members/${id}`);
  }
  createMember(data) {
    return this.post("/members", data);
  }
  updateMember(id, data) {
    return this.post(`/members/${id}`, data);
  }
  deleteMember(id) {
    return this.delete(`/members/${id}`);
  }
  deactivateMember(memberId) {
    return this.post("/members/deactivate", { member_id: memberId });
  }
  activateMember(memberId) {
    return this.post("/members/activate", { member_id: memberId });
  }
  getMemberPosts(id, opts = {}) {
    return this.get(`/members/${id}/posts`, opts);
  }
  getMemberTeams(id) {
    return this.get(`/members/${id}/teams`);
  }
  assignMemberTeam(memberId, teamId) {
    return this.post(`/members/${memberId}/teams`, { id: teamId });
  }
  removeMemberTeam(memberId, teamId) {
    return this.delete(`/members/${memberId}/teams/${teamId}`);
  }

  // --- Posts ---
  listPosts(opts = {}) {
    return this.get("/posts", opts);
  }
  getPost(id) {
    return this.get(`/posts/${id}`);
  }
  createPost(data) {
    return this.post("/posts", data);
  }
  updatePost(id, data) {
    return this.post(`/posts/${id}`, data);
  }
  deletePost(id) {
    return this.delete(`/posts/${id}`);
  }

  // --- Comments ---
  listComments(postId, opts = {}) {
    return this.get(`/posts/${postId}/comments`, opts);
  }
  createComment(postId, data) {
    return this.post(`/posts/${postId}/comments`, data);
  }
  updateComment(postId, commentId, data) {
    return this.post(`/posts/${postId}/comments/${commentId}`, data);
  }
  deleteComment(postId, commentId) {
    return this.delete(`/posts/${postId}/comments/${commentId}`);
  }

  // --- Pages ---
  listPages(opts = {}) {
    return this.get("/pages", opts);
  }
  getPage(id) {
    return this.get(`/pages/${id}`);
  }
  createPage(data) {
    return this.post("/pages", data);
  }
  updatePage(id, data) {
    return this.post(`/pages/${id}`, data);
  }
  deletePage(id) {
    return this.delete(`/pages/${id}`);
  }

  // --- Categories ---
  listCategories(opts = {}) {
    return this.get("/categories", opts);
  }
  getCategory(id) {
    return this.get(`/categories/${id}`);
  }
  createCategory(data) {
    return this.post("/categories", data);
  }
  updateCategory(id, data) {
    return this.post(`/categories/${id}`, data);
  }
  deleteCategory(id) {
    return this.delete(`/categories/${id}`);
  }
  getCategoryPosts(id, opts = {}) {
    return this.get(`/categories/${id}/posts`, opts);
  }
  getCategoryFollowers(id, opts = {}) {
    return this.get(`/categories/${id}/followers`, opts);
  }

  // --- Tags ---
  listTags(opts = {}) {
    return this.get("/tags", opts);
  }
  getTag(id) {
    return this.get(`/tags/${id}`);
  }
  getPostTags(postId) {
    return this.get(`/posts/${postId}/tags`);
  }

  // --- Teams ---
  listTeams(opts = {}) {
    return this.get("/teams", opts);
  }
  getTeam(id) {
    return this.get(`/teams/${id}`);
  }
  createTeam(data) {
    return this.post("/teams", data);
  }
  updateTeam(id, data) {
    return this.post(`/teams/${id}`, data);
  }
  deleteTeam(id) {
    return this.delete(`/teams/${id}`);
  }

  // --- Search ---
  search(terms, opts = {}) {
    return this.get("/search", { terms, ...opts });
  }

  // --- Stats ---
  postStats(opts = {}) {
    return this.get("/stats/posts", opts);
  }
  memberStats(opts = {}) {
    return this.get("/stats/members", opts);
  }
}

module.exports = BlogInClient;
