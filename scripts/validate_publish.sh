#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

remote="${PUBLISH_REMOTE:-origin}"
expected_branch="master"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required for make publish."
}

require_clean_worktree() {
  dirty_status="$(git status --porcelain)"
  if [[ -n "${dirty_status}" ]]; then
    printf '%s\n' "Refusing to publish from a dirty worktree. Commit or stash first." >&2
    printf '%s\n' "${dirty_status}" >&2
    exit 1
  fi
}

require_command git
require_command make
require_command timeout
require_command docker

current_branch="$(git branch --show-current)"
if [[ "${current_branch}" != "${expected_branch}" ]]; then
  current_branch_label="${current_branch:-detached HEAD}"
  fail "Refusing to publish from ${current_branch_label}; expected ${expected_branch}."
fi

require_clean_worktree

printf '%s\n' "Refreshing ${remote}/${expected_branch} and release tags before publish validation."
git fetch "${remote}" "${expected_branch}:refs/remotes/${remote}/${expected_branch}" --tags

head_commit="$(git rev-parse --verify HEAD)"
remote_branch_commit="$(git rev-parse --verify "refs/remotes/${remote}/${expected_branch}")"
if [[ "${remote_branch_commit}" != "${head_commit}" ]]; then
  fail "Refusing to publish because HEAD ${head_commit} does not match ${remote}/${expected_branch} ${remote_branch_commit}."
fi

version_tag="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
if [[ -z "${version_tag}" ]]; then
  fail "Refusing to publish because HEAD does not have an exact release version tag."
fi
if ! printf '%s\n' "${version_tag}" | grep -Eq '^v[0-9]+[.][0-9]+[.][0-9]+$'; then
  fail "Refusing to publish because ${version_tag} is not a SemVer release tag like v1.2.3."
fi

local_tag_commit="$(git rev-parse --verify "${version_tag}^{}")"
if [[ "${local_tag_commit}" != "${head_commit}" ]]; then
  fail "Refusing to publish because ${version_tag} resolves to ${local_tag_commit}, not HEAD ${head_commit}."
fi

remote_tag_lines="$(git ls-remote --tags "${remote}" "refs/tags/${version_tag}" "refs/tags/${version_tag}^{}")"
remote_tag_commit=""
while read -r candidate_commit candidate_ref; do
  if [[ "${candidate_ref}" == "refs/tags/${version_tag}" && -z "${remote_tag_commit}" ]]; then
    remote_tag_commit="${candidate_commit}"
  fi
  if [[ "${candidate_ref}" == "refs/tags/${version_tag}^{}" ]]; then
    remote_tag_commit="${candidate_commit}"
  fi
done <<< "${remote_tag_lines}"

if [[ -z "${remote_tag_commit}" ]]; then
  fail "Refusing to publish because ${version_tag} is not present on ${remote}."
fi
if [[ "${remote_tag_commit}" != "${head_commit}" ]]; then
  fail "Refusing to publish because ${remote}/${version_tag} resolves to ${remote_tag_commit}, not HEAD ${head_commit}."
fi

printf '%s\n' "Running required publish validation: timeout -k 350s -s SIGKILL 350s make ci"
timeout -k 350s -s SIGKILL 350s make ci

require_clean_worktree

post_ci_head_commit="$(git rev-parse --verify HEAD)"
if [[ "${post_ci_head_commit}" != "${head_commit}" ]]; then
  fail "Refusing to publish because HEAD changed during validation."
fi

printf '%s\n' "Publish validation passed for ${version_tag} at ${head_commit}."
