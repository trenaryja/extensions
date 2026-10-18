package dev.trenary.glyphary;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/** Hosts the web picker; launchers start it for a result, the app drawer starts it to browse. */
public class PickerActivity extends Activity {
	/** Reserved by Android for app-served WebView content; never reaches the network. */
	private static final String HOST = "appassets.androidplatform.net";

	/** Fallback when the launcher sends no `iconSize`; capped because the result bitmap rides a Binder transaction limited to 1 MB. */
	private static final int RESULT_PX = 192;

	private static final int MAX_RESULT_PX = 384;

	private static final int PREVIEW_PX = 96;

	@Override
	protected void onCreate(Bundle state) {
		super.onCreate(state);
		WebView web = new WebView(this);
		web.setBackgroundColor(Color.BLACK);
		web.getSettings().setJavaScriptEnabled(true);
		web.addJavascriptInterface(new Bridge(), "Glyphary");
		web.setWebViewClient(new WebViewClient() {
			@Override
			public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
				Uri url = request.getUrl();
				if (!HOST.equals(url.getHost())) return null;
				String path = url.getPath();
				return path.startsWith("/icon/") ? icon(path.substring("/icon/".length())) : asset(path);
			}

			@Override
			public void onPageFinished(WebView view, String url) {
				view.requestFocus();
				view.evaluateJavascript("document.querySelector('#search').focus()", null);
				getSystemService(InputMethodManager.class).showSoftInput(view, 0);
			}
		});
		web.loadUrl("https://" + HOST + "/index.html");
		FrameLayout root = new FrameLayout(this);
		root.addView(web);
		// Edge-to-edge from target 35: without this the page sits under the status bar and the keyboard.
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
			root.setOnApplyWindowInsetsListener((view, insets) -> {
				android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
				view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
				return WindowInsets.CONSUMED;
			});
		setContentView(root);
	}

	/** Set only by startActivityForResult, so the app drawer and theme queries both browse. */
	private boolean picking() {
		return getCallingActivity() != null;
	}

	private int drawableId(String name) {
		return getResources().getIdentifier(name, "drawable", getPackageName());
	}

	private Bitmap render(int id, int px) {
		Drawable drawable = getDrawable(id);
		Bitmap bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
		drawable.setBounds(0, 0, px, px);
		drawable.draw(new Canvas(bitmap));
		return bitmap;
	}

	private WebResourceResponse icon(String name) {
		int id = drawableId(name);
		if (id == 0) return new WebResourceResponse("text/plain", null, 404, "Not Found", null, null);
		ByteArrayOutputStream png = new ByteArrayOutputStream();
		render(id, PREVIEW_PX).compress(Bitmap.CompressFormat.PNG, 100, png);
		return new WebResourceResponse("image/png", null, new ByteArrayInputStream(png.toByteArray()));
	}

	private WebResourceResponse asset(String path) {
		String mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".json") ? "application/json" : "text/html";
		try {
			return new WebResourceResponse(mime, "utf-8", getAssets().open("picker" + path));
		} catch (IOException missing) {
			return new WebResourceResponse("text/plain", null, 404, "Not Found", null, null);
		}
	}

	private class Bridge {
		@JavascriptInterface
		public boolean picking() {
			return PickerActivity.this.picking();
		}

		/** Returns both forms: Nova reads the bitmap, Lawnchair and ADW-style launchers read the resource. */
		@JavascriptInterface
		public void pick(String name) {
			int id = drawableId(name);
			if (id == 0) return;
			Intent result = new Intent();
			result.putExtra("icon", render(id, Math.min(getIntent().getIntExtra("iconSize", RESULT_PX), MAX_RESULT_PX)));
			result.putExtra(Intent.EXTRA_SHORTCUT_ICON_RESOURCE, Intent.ShortcutIconResource.fromContext(PickerActivity.this, id));
			runOnUiThread(() -> {
				setResult(RESULT_OK, result);
				finish();
			});
		}
	}
}
