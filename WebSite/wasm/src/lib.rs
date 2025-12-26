//! Rust → WebAssembly (wasm) 背景アニメーションの最小スケルトン。
//! - wasm-bindgen を使ってブラウザの Canvas / WebGL2 にアクセスします。
//! - このファイルは「初期化関数 (init) と start(canvas) を呼ぶ」呼び出し方法を想定しています。
//!   wasm-pack でビルドした場合、生成される JS から `init()` を呼んでから `start(canvas)` を呼んでください。
//!
//! 注意:
//! - 実装はできるだけ簡潔にしてあり、シェーダーや描画ループは最小限の例です。
//! - 実際の高度な表現や最適化（パーティクル管理、テクスチャ、バッファの細分化等）はここから拡張してください。

use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{
    CanvasRenderingContext2d, Document, HtmlCanvasElement, WebGl2RenderingContext,
    WebGlProgram, WebGlShader, Window,
};

/// パニック時にブラウザコンソールへ表示する（有効なら）
/// console_error_panic_hook を features に入れてビルドすると有用。
#[cfg(feature = "console_error_panic_hook")]
fn set_panic_hook() {
    console_error_panic_hook::set_once();
}
#[cfg(not(feature = "console_error_panic_hook"))]
fn set_panic_hook() {}

/// シンプルなログユーティリティ
fn log(s: &str) {
    web_sys::console::log_1(&JsValue::from_str(s));
}

/// 指定した `canvas` から WebGL2 コンテキストを取得する（失敗時は Err）
fn get_webgl2_context(canvas: &HtmlCanvasElement) -> Result<WebGl2RenderingContext, JsValue> {
    let gl_val = canvas
        .get_context("webgl2")
        .map_err(|e| JsValue::from(e))?
        .ok_or_else(|| JsValue::from_str("WebGL2 not supported"))?;

    let gl: WebGl2RenderingContext = gl_val
        .dyn_into()
        .map_err(|_| JsValue::from_str("Failed to cast to WebGl2RenderingContext"))?;
    Ok(gl)
}

/// シェーダーをコンパイルするユーティリティ
fn compile_shader(gl: &WebGl2RenderingContext, source: &str, shader_type: u32) -> Result<WebGlShader, JsValue> {
    let shader = gl
        .create_shader(shader_type)
        .ok_or_else(|| JsValue::from_str("Unable to create shader object"))?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);

    let compiled = gl.get_shader_parameter(&shader, WebGl2RenderingContext::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false);

    if compiled {
        Ok(shader)
    } else {
        let log = gl.get_shader_info_log(&shader).unwrap_or_else(|| "Unknown shader compile error".into());
        Err(JsValue::from_str(&format!("Shader compile error: {}", log)))
    }
}

/// プログラムをリンクするユーティリティ
fn link_program(gl: &WebGl2RenderingContext, vert: &WebGlShader, frag: &WebGlShader) -> Result<WebGlProgram, JsValue> {
    let program = gl
        .create_program()
        .ok_or_else(|| JsValue::from_str("Unable to create shader program"))?;
    gl.attach_shader(&program, vert);
    gl.attach_shader(&program, frag);
    gl.link_program(&program);

    let linked = gl.get_program_parameter(&program, WebGl2RenderingContext::LINK_STATUS)
        .as_bool()
        .unwrap_or(false);

    if linked {
        Ok(program)
    } else {
        let log = gl.get_program_info_log(&program).unwrap_or_else(|| "Unknown program link error".into());
        Err(JsValue::from_str(&format!("Program link error: {}", log)))
    }
}

/// デフォルトの頂点シェーダ（フルスクリーン三角形を想定）
const VERT_SHADER_SRC: &str = r#"#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
"#;

/// デフォルトのフラグメントシェーダ（時間依存のグラデーション）
const FRAG_SHADER_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_resolution;
void main() {
    vec2 uv = v_uv;
    vec3 c = vec3(0.1, 0.12, 0.2);
    // シンプルなノイズ風のアニメーション（例）
    float t = u_time * 0.3;
    float g = 0.5 + 0.5 * sin((uv.x + uv.y) * 10.0 + t);
    vec3 col = mix(vec3(0.08,0.16,0.6), vec3(0.1,0.8,0.95), g);
    outColor = vec4(col, 1.0);
}
"#;

/// wasm 側から呼び出す初期化関数（明示的に呼ぶ必要はないが export しておく）
/// ここでは何もせずフックを立てるだけにしているが、ビルド時や初期化処理が必要な場合に利用可能。
#[wasm_bindgen]
pub fn init() {
    set_panic_hook();
    log("bg_wasm: init()");
}

/// HTML の canvas 要素を受け取り、WebGL2 を初期化して描画ループを開始する。
/// JS 側からは `wasm_module.start(document.getElementById('bg-canvas'))` のように呼びます。
#[wasm_bindgen]
pub fn start(canvas: HtmlCanvasElement) -> Result<(), JsValue> {
    set_panic_hook();
    log("bg_wasm: start() called");

    // WebGL2 コンテキスト取得
    let gl = get_webgl2_context(&canvas)?;
    // ビューポート / ステート初期化
    gl.clear_color(0.0, 0.0, 0.0, 0.0);
    gl.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);

    // シェーダー作成
    let vert = compile_shader(&gl, VERT_SHADER_SRC, WebGl2RenderingContext::VERTEX_SHADER)?;
    let frag = compile_shader(&gl, FRAG_SHADER_SRC, WebGl2RenderingContext::FRAGMENT_SHADER)?;
    let program = link_program(&gl, &vert, &frag)?;

    gl.use_program(Some(&program));

    // 頂点データ（フルスクリーン三角形）: 3頂点 (x,y)
    let vertices: [f32; 6] = [
        -1.0, -1.0, // 左下
        3.0, -1.0,  // 右下（外側）
        -1.0, 3.0,  // 左上（外側）
    ];

    // VBO を作成してバインド
    let buffer = gl.create_buffer().ok_or_else(|| JsValue::from_str("Failed to create buffer"))?;
    gl.bind_buffer(WebGl2RenderingContext::ARRAY_BUFFER, Some(&buffer));

    // バッファにデータをアップロード
    // Note: bytemuck / unsafe を使わずに js_sys::Float32Array を経由
    unsafe {
        let vert_array = js_sys::Float32Array::view(&vertices);
        gl.buffer_data_with_array_buffer_view(
            WebGl2RenderingContext::ARRAY_BUFFER,
            &vert_array,
            WebGl2RenderingContext::STATIC_DRAW,
        );
    }

    // attribute ロケーションを有効化
    let pos_attrib_loc = 0; // layout(location = 0) を頂点シェーダーで使用
    gl.enable_vertex_attrib_array(pos_attrib_loc as u32);
    gl.vertex_attrib_pointer_with_i32(pos_attrib_loc as u32, 2, WebGl2RenderingContext::FLOAT, false, 0, 0);

    // uniform ロケーション取得
    let u_time = gl.get_uniform_location(&program, "u_time");
    let u_resolution = gl.get_uniform_location(&program, "u_resolution");

    // Canvas / DPI に合わせたリサイズ関数
    let gl_rc = Rc::new(gl);
    {
        let canvas_clone = canvas.clone();
        let gl_ref = gl_rc.clone();
        // 最初に一度サイズを設定
        resize_canvas_to_display_size(&canvas_clone, &gl_ref, &u_resolution);
    }

    // ウィンドウリサイズ時に canvas サイズを更新
    {
        let gl_for_resize = gl_rc.clone();
        let canvas_for_resize = canvas.clone();
        let closure = Closure::wrap(Box::new(move || {
            let _ = resize_canvas_to_display_size(&canvas_for_resize, &gl_for_resize, &u_resolution);
        }) as Box<dyn FnMut()>);
        // window.addEventListener("resize", ...)
        web_sys::window()
            .and_then(|w| w.add_event_listener_with_callback("resize", closure.as_ref().unchecked_ref()).ok())
            .ok();
        // Closure をメモリリークさせてイベントリスナを生かす
        closure.forget();
    }

    // アニメーションループのセットアップ
    {
        let gl_loop = gl_rc.clone();
        // Rc<RefCell<Option<Closure<dyn FnMut(f64)>>>> パターンで自リファレンスを保持
        let f = Rc::new(RefCell::new(None));
        let g = f.clone();

        // 初期時間参照
        let start_time = js_sys::Date::now();

        let u_time_clone = u_time.clone();

        *g.borrow_mut() = Some(Closure::wrap(Box::new(move |time_ms: f64| {
            // time_ms は requestAnimationFrame から渡される DOMHighResTimeStamp (ms)
            let elapsed = (time_ms - start_time) / 1000.0; // 秒
            // u_time が存在すれば更新
            if let Some(loc) = &u_time_clone {
                // WebGL の uniform1f は f32
                gl_loop.uniform1f(Some(loc), elapsed as f32);
            }

            // クリア（必要に応じて変更）
            gl_loop.clear(WebGl2RenderingContext::COLOR_BUFFER_BIT);

            // 描画
            gl_loop.draw_arrays(WebGl2RenderingContext::TRIANGLES, 0, 3);

            // 次フレームを要求
            // f.borrow().as_ref() は Some(closure)
            if let Some(cb) = f.borrow().as_ref() {
                // requestAnimationFrame expects a &Function
                let _ = web_sys::window()
                    .and_then(|w| w.request_animation_frame(cb.as_ref().unchecked_ref()).ok());
            }
        }) as Box<dyn FnMut(f64)>));

        // 最初の呼び出し
        if let Some(cb) = g.borrow().as_ref() {
            let _ = web_sys::window()
                .and_then(|w| w.request_animation_frame(cb.as_ref().unchecked_ref()).ok());
        }

        // Leak the closure intentionally so it lives for the lifetime of the page.
        // The closure is still reachable via the Rc we dropped out of scope; it's leaked but that's acceptable for a long-lived animation.
        let _leaked = g.borrow().as_ref().unwrap().as_ref().clone();
        // Note: We intentionally do not call .forget() on the Closure here because we keep it inside Rc<RefCell<Option<...>>>.
        // However, to ensure it is not dropped, we call forget:
        g.borrow().as_ref().unwrap().forget();
    }

    Ok(())
}

/// canvas の表示サイズ（CSSサイズ × devicePixelRatio）に合わせて実際の幅・高さを設定し、gl.viewport を更新する。
fn resize_canvas_to_display_size(
    canvas: &HtmlCanvasElement,
    gl: &WebGl2RenderingContext,
    u_resolution: &Option<web_sys::WebGlUniformLocation>,
) -> Result<(), JsValue> {
    let window = web_sys::window().ok_or_else(|| JsValue::from_str("No window"))?;
    let dpr = window.device_pixel_ratio();

    // クライアントサイズ（CSS px）
    let client_width = canvas.client_width() as f64;
    let client_height = canvas.client_height() as f64;

    // 実際のバッファサイズ
    let width = (client_width * dpr).round() as i32;
    let height = (client_height * dpr).round() as i32;

    if canvas.width() != width as u32 || canvas.height() != height as u32 {
        canvas.set_width(width as u32);
        canvas.set_height(height as u32);
        gl.viewport(0, 0, width, height);
    } else {
        gl.viewport(0, 0, width, height);
    }

    if let Some(loc) = u_resolution {
        // uniform2f による解像度伝播（f32）
        gl.uniform2f(Some(loc), client_width as f32, client_height as f32);
    }

    Ok(())
}
