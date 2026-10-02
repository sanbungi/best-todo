package com.besttodo.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://todo.local";
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        if (isDebuggable()) {
            // 開発時のみ http のバックエンドへの接続を許可する
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            webView.addJavascriptInterface(new DevBridge(), "AndroidDev");
        } else {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        webView.setWebViewClient(new LocalAssetWebViewClient());
        setContentView(webView);
        webView.loadUrl(APP_ORIGIN + "/index.html");
    }

    private boolean isDebuggable() {
        return (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static class DevBridge {
        @JavascriptInterface
        public boolean allowInsecureBackend() {
            return true;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private class LocalAssetWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            return !APP_ORIGIN.equals(uri.getScheme() + "://" + uri.getHost());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String origin = uri.getScheme() + "://" + uri.getHost();
            if (!APP_ORIGIN.equals(origin)) return null;

            String path = uri.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return notFound();

            String assetPath = "public" + path;
            try {
                InputStream stream = getAssets().open(assetPath);
                return new WebResourceResponse(mimeType(assetPath), "UTF-8", stream);
            } catch (IOException e) {
                return notFound();
            }
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse("text/plain", "UTF-8", null);
        }

        private String mimeType(String path) {
            String extension = MimeTypeMap.getFileExtensionFromUrl(path).toLowerCase(Locale.ROOT);
            if ("js".equals(extension) || "mjs".equals(extension)) return "text/javascript";
            if ("css".equals(extension)) return "text/css";
            if ("html".equals(extension)) return "text/html";
            String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            return type != null ? type : "application/octet-stream";
        }
    }
}
