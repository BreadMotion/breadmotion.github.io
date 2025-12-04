/**
 * @file auto-translate.js
 * @description Gemini API または GitHub Models を使用して日本語ブログ記事を英語に自動翻訳するスクリプト
 * @summary
 *   - content/blog 内の .md ファイルを読み込み、英語版 (.en.md) を生成
 *   - フロントマター（title, description, category, tags）と本文を翻訳
 *   - 既に英語版が存在する場合はスキップ
 *   - 環境変数 TRANSLATION_PROVIDER で 'gemini' または 'github' を切り替え可能
 */

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
require("dotenv").config();

// ───────────────────────────────────────────────────────────────
// 簡易ロガー: NODE_ENV !== 'production' の場合のみ verbose 出力
// ───────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";
const logger = {
  info: (msg) =>
    !isProduction && console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
};

// ───────────────────────────────────────────────────────────────
// Configuration & Validation
// ───────────────────────────────────────────────────────────────

// プロバイダーの決定: 環境変数指定 -> GeminiキーがあるならGemini -> GitHubキーがあるならGitHub
let provider = process.env.TRANSLATION_PROVIDER;
if (!provider) {
  if (process.env.GEMINI_API_KEY) {
    provider = "gemini";
  } else if (process.env.GITHUB_TOKEN) {
    provider = "github";
  }
}

// Gemini Config
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// GitHub Models Config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_MODEL = process.env.GITHUB_MODEL || "gpt-4o";
const GITHUB_ENDPOINT =
  "https://models.inference.ai.azure.com/chat/completions";

// Validate Configuration
if (provider === "gemini") {
  if (!GEMINI_API_KEY) {
    logger.error("GEMINI_API_KEY is not set.");
    process.exit(1);
  }
  logger.info(`Using Provider: Gemini (${GEMINI_MODEL})`);
} else if (provider === "github") {
  if (!GITHUB_TOKEN) {
    logger.error("GITHUB_TOKEN is not set.");
    logger.error(
      "Please set GITHUB_TOKEN to use GitHub Models.",
    );
    process.exit(1);
  }
  logger.info(
    `Using Provider: GitHub Models (${GITHUB_MODEL})`,
  );
  // NOTE: Provide an explicit hint to users so they can verify PAT type/permissions quickly.
  // GitHub Models require a Fine‑grained Personal Access Token with the `Models` (user_models) permission (read).
  // If you selected an organization as the resource owner when creating the FG token, ensure the token is approved and not pending.
  logger.info(
    "Hint: Ensure your token is a Fine‑grained PAT and has 'Models (user_models): read' permission. If the token targets an organization, check that it is approved (not pending).",
  );
} else {
  logger.error("No valid translation provider found.");
  logger.error(
    "Please set GEMINI_API_KEY or GITHUB_TOKEN in your .env file.",
  );
  process.exit(1);
}

const ROOT_DIR = path.join(__dirname, "..");
const BLOG_DIR = path.join(ROOT_DIR, "content", "blog");

// ───────────────────────────────────────────────────────────────
// Translation Logic
// ───────────────────────────────────────────────────────────────

async function translateText(text, context = "") {
  if (!text) return "";

  const systemPrompt = `You are a professional technical translator.
Translate the following Japanese text to English for a technical blog.
Maintain the original Markdown formatting, code blocks, and links perfectly.
Ensure technical terms are translated accurately in the context of software engineering (Unity, UE5, Web, etc.).
Do not translate the file path in the image link.
${context ? `Context: ${context}` : ""}
`;

  if (provider === "gemini") {
    return await translateWithGemini(text, systemPrompt);
  } else {
    return await translateWithGitHub(text, systemPrompt);
  }
}

async function translateWithGemini(text, systemPrompt) {
  const requestBody = {
    system_instruction: {
      parts: { text: systemPrompt },
    },
    contents: [
      {
        role: "user",
        parts: [{ text: text }],
      },
    ],
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE",
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Gemini API Error: ${response.status} - ${JSON.stringify(error)}`,
      );
    }

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      throw new Error(
        "Failed to parse Gemini response: No candidates found",
      );
    }

    const candidate = data.candidates[0];
    if (
      candidate.finishReason &&
      candidate.finishReason !== "STOP"
    ) {
      logger.warn(
        `Translation stopped early. Reason: ${candidate.finishReason}`,
      );
      if (!candidate.content?.parts?.[0]?.text) {
        throw new Error(
          `Generation blocked due to: ${candidate.finishReason}`,
        );
      }
    }

    return candidate.content.parts[0].text.trim();
  } catch (error) {
    logger.error(
      `Gemini Translation failed: ${error.message}`,
    );
    throw error;
  }
}

async function translateWithGitHub(text, systemPrompt) {
  const requestBody = {
    model: GITHUB_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  };

  try {
    const response = await fetch(GITHUB_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch (e) {
        // Non-JSON response body or empty
        errorBody = {
          raw: await response.text().catch(() => ""),
        };
      }

      // Provide actionable, clearer error messages for common statuses
      if (response.status === 401) {
        throw new Error(
          `GitHub API Error: 401 Unauthorized - The token is invalid or lacks required permissions (e.g. 'Models' permission). Ensure your Fine‑grained PAT has 'Models (user_models): read' and is approved. Full response: ${JSON.stringify(errorBody)}`,
        );
      } else if (response.status === 403) {
        throw new Error(
          `GitHub API Error: 403 Forbidden - Access denied. Check token scopes, repository access settings and whether the account has access to the requested model. Full response: ${JSON.stringify(errorBody)}`,
        );
      } else if (response.status === 404) {
        throw new Error(
          `GitHub API Error: 404 Not Found - Endpoint or model not available. Verify the model name (${GITHUB_MODEL}), the API endpoint, and that your account has access to GitHub AI Models. Full response: ${JSON.stringify(errorBody)}`,
        );
      } else {
        throw new Error(
          `GitHub API Error: ${response.status} - ${JSON.stringify(errorBody)}`,
        );
      }
    }

    const data = await response.json();

    // Try several common response shapes to extract the generated text
    let translated = null;

    // 1) choices -> choices[0].message.content (classic chat-like)
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      translated = data.choices[0].message.content.trim();
    }
    // 2) output_text top-level
    else if (
      data.output_text &&
      typeof data.output_text === "string"
    ) {
      translated = data.output_text.trim();
    }
    // 3) output as string
    else if (typeof data.output === "string") {
      translated = data.output.trim();
    }
    // 4) nested output array -> output[0].content[0].text (other shapes)
    else if (
      Array.isArray(data.output) &&
      data.output[0] &&
      data.output[0].content &&
      Array.isArray(data.output[0].content) &&
      data.output[0].content[0].text
    ) {
      translated = data.output[0].content[0].text.trim();
    }

    if (!translated) {
      throw new Error(
        "Failed to parse GitHub response: Invalid format. Full response: " +
          JSON.stringify(data),
      );
    }

    return translated;
  } catch (error) {
    logger.error(
      `GitHub Translation failed: ${error.message}`,
    );
    throw error;
  }
}

// ───────────────────────────────────────────────────────────────
// File Processing
// ───────────────────────────────────────────────────────────────

async function processFile(filePath) {
  const fileName = path.basename(filePath);
  const id = path.basename(filePath, ".md");
  const enFilePath = path.join(BLOG_DIR, `${id}.en.md`);

  if (fs.existsSync(enFilePath)) {
    logger.info(
      `Skipping ${fileName}: English version already exists.`,
    );
    return;
  }

  logger.info(`Processing ${fileName}...`);
  const content = fs.readFileSync(filePath, "utf8");
  const { data: frontmatter, content: markdownBody } =
    matter(content);

  try {
    // 1. Translate Frontmatter
    logger.info(`  - Translating metadata...`);
    const translatedTitle = await translateText(
      frontmatter.title,
      "Title of the blog post",
    );
    const translatedDesc = await translateText(
      frontmatter.description,
      "Description of the blog post",
    );

    let translatedCategory = frontmatter.category;
    if (
      /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(
        translatedCategory,
      )
    ) {
      translatedCategory = await translateText(
        translatedCategory,
        "Category name",
      );
    }

    // Tags
    let translatedTags = [];
    if (Array.isArray(frontmatter.tags)) {
      for (const tag of frontmatter.tags) {
        if (
          /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(
            tag,
          )
        ) {
          translatedTags.push(
            await translateText(tag, "Tag"),
          );
        } else {
          translatedTags.push(tag);
        }
      }
    }

    // 2. Translate Body
    logger.info(`  - Translating body...`);
    const translatedBody = await translateText(
      markdownBody,
      "Main content of the blog post in Markdown format",
    );

    // 3. Construct new Frontmatter
    const newFrontmatter = {
      ...frontmatter,
      title: translatedTitle,
      description: translatedDesc,
      category: translatedCategory,
      tags: translatedTags,
    };

    // 4. Write file
    const newContent = matter.stringify(
      translatedBody,
      newFrontmatter,
    );
    fs.writeFileSync(enFilePath, newContent, "utf8");
    logger.success(`Created ${id}.en.md`);
  } catch (error) {
    logger.error(
      `Failed to process ${fileName}: ${error.message}`,
    );
  }
}

async function main() {
  const targetId = process.argv[2];

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter(
      (f) => f.endsWith(".md") && !f.endsWith(".en.md"),
    );

  if (targetId) {
    const targetFile = files.find(
      (f) => f === `${targetId}.md` || f === targetId,
    );
    if (targetFile) {
      await processFile(path.join(BLOG_DIR, targetFile));
    } else {
      logger.error(`File not found: ${targetId}`);
    }
  } else {
    logger.info(`Found ${files.length} Japanese articles.`);
    for (const file of files) {
      await processFile(path.join(BLOG_DIR, file));
    }
  }
}

main().catch((err) => logger.error(err.message));
