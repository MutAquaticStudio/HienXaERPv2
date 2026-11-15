package com.hienxavlxd.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * D82: app Android "Hiền Xa". The screens are the ERP website (https://app.hienxavlxd.com) shown in the app's own WebView,
 * so it needs no Chrome and every web deploy is in the app at once. Native parts: sign-in kept (cookies), photos from the
 * camera or gallery, location for attendance and delivery tracking, phone / Zalo / map links opened in their own apps, file
 * downloads (PDFs open when done; files the page builds itself are saved too), Back, and a "no connection" screen.
 */
public class MainActivity extends Activity {
    private static final int REQUEST_FILE = 10;
    private static final int REQUEST_CAMERA = 11;
    private static final int REQUEST_LOCATION = 12;
    private static final int REQUEST_STORAGE = 13;
    private static final String STATE_URL = "hx_url";
    private static final String BRIDGE = "HienXaAndroid";
    private static final long CAMERA_FILE_MAX_AGE_MS = 24L * 60 * 60 * 1000;

    /** Remembers the name of an <a download> the page clicks, and keeps blob: links alive long enough to save them. */
    private static final String PAGE_HELPER = "(function(){if(window.__hxApp)return;window.__hxApp=true;"
            + "var c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){"
            + "if(this.hasAttribute('download'))window.__hxName=this.getAttribute('download');return c.apply(this,arguments);};"
            + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[download]'):null;"
            + "if(a)window.__hxName=a.getAttribute('download');},true);"
            + "var r=URL.revokeObjectURL;URL.revokeObjectURL=function(u){setTimeout(function(){r.call(URL,u);},60000);};})();";

    private WebView web;
    private ProgressBar progress;
    private View offline;
    private boolean mainFrameFailed;
    private boolean rendererGone;

    private ValueCallback<Uri[]> fileCallback;
    private WebChromeClient.FileChooserParams fileParams;
    private File cameraFile;
    private Uri cameraUri;

    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    private String[] pendingDownload;
    private final Set<Long> openWhenDone = new HashSet<>();
    private BroadcastReceiver downloadReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android 15+ draws apps edge to edge: keep the page clear of the status bar, navigation bar and keyboard.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        try {
            setContentView(R.layout.activity_main);
        } catch (RuntimeException missingWebView) {
            // The phone's "Android System WebView" is missing or being updated.
            TextView message = new TextView(this);
            message.setText(R.string.webview_missing);
            message.setGravity(Gravity.CENTER);
            message.setPadding(48, 48, 48, 48);
            message.setTextSize(18);
            message.setTextColor(0xFFFFFFFF);
            message.setBackgroundColor(ContextCompat.getColor(this, R.color.brand));
            setContentView(message);
            return;
        }
        View root = findViewById(R.id.root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(getWindow(), root);
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);

        web = findViewById(R.id.web);
        progress = findViewById(R.id.progress);
        offline = findViewById(R.id.offline);
        findViewById(R.id.retry).setOnClickListener(view -> {
            offline.setVisibility(View.GONE);
            String current = web.getUrl();
            if (current == null || current.startsWith("about:") || current.startsWith("data:")) web.loadUrl(BuildConfig.APP_URL);
            else web.reload();
        });

        configureWebView();
        registerBack();
        registerDownloadReceiver();
        cleanCameraFiles();

        String restored = savedInstanceState == null ? null : savedInstanceState.getString(STATE_URL);
        web.loadUrl(restored != null && isAppUrl(Uri.parse(restored)) ? restored : launchUrl(getIntent()));
    }

    private void configureWebView() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        // The website recognises the app by this (hides "Tải app", explains notifications).
        settings.setUserAgentString(settings.getUserAgentString() + " HienXaAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), BRIDGE);
        web.setWebViewClient(new AppWebViewClient());
        web.setWebChromeClient(new AppChromeClient());
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                download(url, userAgent, contentDisposition, mimeType));
    }

    private void registerBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
    }

    private void goBack() {
        if (web != null && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        goBack();
    }

    private static boolean isAppUrl(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && uri.getHost() != null
                && uri.getHost().equalsIgnoreCase(BuildConfig.APP_HOST);
    }

    private String launchUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && Intent.ACTION_VIEW.equals(intent.getAction()) && isAppUrl(data)) return data.toString();
        return BuildConfig.APP_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (web != null && intent.getData() != null) web.loadUrl(launchUrl(intent));
    }

    /** Links that leave the ERP (phone, Zalo, maps, other sites) open in the phone's own apps. */
    private void openOutside(Uri uri) {
        try {
            if ("intent".equals(uri.getScheme())) {
                Intent intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException missing) {
                    String fallback = intent.getStringExtra("browser_fallback_url");
                    if (fallback == null) throw missing;
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                }
            } else {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            }
        } catch (Exception error) {
            toast(getString(R.string.no_app_for_link));
        }
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme();
            boolean http = "https".equals(scheme) || "http".equals(scheme);
            // Embedded frames (maps, QR) stay where they are; only the page itself leaves for another site.
            if (http && (!request.isForMainFrame() || isAppUrl(uri))) return false;
            if ("about".equals(scheme) || "blob".equals(scheme) || "data".equals(scheme) || "javascript".equals(scheme)) return false;
            openOutside(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            mainFrameFailed = false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!mainFrameFailed) offline.setVisibility(View.GONE);
            view.evaluateJavascript(PAGE_HELPER, null);
            CookieManager.getInstance().flush();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            CharSequence description = error.getDescription();
            // A page left on purpose (a download, a new tap) is not "offline".
            if (description != null && description.toString().contains("ERR_ABORTED")) return;
            mainFrameFailed = true;
            offline.setVisibility(View.VISIBLE);
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The page's renderer stopped (low memory): drop this WebView and start the screen again instead of closing the app.
            rendererGone = true;
            if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
            view.destroy();
            if (view == web) web = null;
            recreate();
            return true;
        }
    }

    private class AppChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
            progress.setProgress(newProgress);
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            fileParams = params;
            if (acceptsImages(params) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA);
            } else {
                openChooser();
            }
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (hasLocation()) {
                callback.invoke(origin, true, false);
                return;
            }
            if (geoCallback != null) geoCallback.invoke(geoOrigin, false, false);
            geoOrigin = origin;
            geoCallback = callback;
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
        }
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean acceptsImages(WebChromeClient.FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String type : types) {
            if (type == null || type.isEmpty() || type.contains("image") || type.contains("*/*")) return true;
        }
        return false;
    }

    private Intent cameraIntent() {
        if (!acceptsImages(fileParams) || checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) return null;
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return null;
            cameraFile = new File(dir, "anh-" + System.currentTimeMillis() + ".jpg");
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", cameraFile);
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // Some camera apps (opened from the chooser) only get the file through an explicit grant.
            for (ResolveInfo app : getPackageManager().queryIntentActivities(camera, PackageManager.MATCH_DEFAULT_ONLY)) {
                grantUriPermission(app.activityInfo.packageName, cameraUri,
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
            return camera;
        } catch (Exception error) {
            cameraFile = null;
            cameraUri = null;
            return null;
        }
    }

    private void openChooser() {
        if (fileCallback == null || fileParams == null) return;
        Intent camera = cameraIntent();
        Intent target;
        if (camera != null && fileParams.isCaptureEnabled()) {
            // <input capture>: straight to the camera, as in a browser.
            target = camera;
        } else {
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            List<String> types = new ArrayList<>();
            if (fileParams.getAcceptTypes() != null) {
                for (String type : fileParams.getAcceptTypes()) {
                    if (type == null) continue;
                    for (String part : type.split(",")) {
                        String clean = part.trim();
                        if (clean.isEmpty()) continue;
                        if (clean.startsWith(".")) {
                            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(clean.substring(1).toLowerCase(Locale.ROOT));
                            if (mime != null) types.add(mime);
                        } else {
                            types.add(clean);
                        }
                    }
                }
            }
            if (types.size() == 1) {
                pick.setType(types.get(0));
            } else {
                pick.setType("*/*");
                if (!types.isEmpty()) pick.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
            }
            if (fileParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            target = Intent.createChooser(pick, getString(R.string.choose_file));
            if (camera != null) target.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }
        try {
            startActivityForResult(target, REQUEST_FILE);
        } catch (Exception error) {
            finishFileChoice(null);
            toast(getString(R.string.no_app_for_link));
        }
    }

    private void finishFileChoice(Uri[] results) {
        if (fileCallback != null) fileCallback.onReceiveValue(results);
        fileCallback = null;
        fileParams = null;
        cameraFile = null;
        cameraUri = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_FILE) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (data != null && data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                ClipData clip = data.getClipData();
                results = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) results[i] = clip.getItemAt(i).getUri();
            } else if (data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            } else if (cameraFile != null && cameraFile.length() > 0) {
                results = new Uri[]{cameraUri};
            }
        }
        finishFileChoice(results);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA) {
            // Without the camera the gallery / files still open.
            openChooser();
        } else if (requestCode == REQUEST_LOCATION && geoCallback != null) {
            geoCallback.invoke(geoOrigin, hasLocation(), false);
            geoCallback = null;
            geoOrigin = null;
        } else if (requestCode == REQUEST_STORAGE && pendingDownload != null) {
            String[] job = pendingDownload;
            pendingDownload = null;
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) download(job[0], job[1], job[2], job[3]);
        }
    }

    private boolean needsStoragePermission() {
        return Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED;
    }

    private void download(String url, String userAgent, String contentDisposition, String mimeType) {
        if (needsStoragePermission()) {
            pendingDownload = new String[]{url, userAgent, contentDisposition, mimeType};
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQUEST_STORAGE);
            return;
        }
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            // A file the page built itself (CSV, Excel, photo): read it in the page and hand it over.
            String fallbackName = contentDisposition != null && contentDisposition.contains("filename")
                    ? URLUtil.guessFileName(url, contentDisposition, mimeType) : "";
            String script = "(function(u,m,n){var x=new XMLHttpRequest();x.open('GET',u,true);x.responseType='blob';"
                    + "x.onload=function(){var f=new FileReader();f.onloadend=function(){"
                    + BRIDGE + ".saveFile(String(f.result),m||x.response.type||'',window.__hxName||n);window.__hxName='';};"
                    + "f.readAsDataURL(x.response);};x.onerror=function(){" + BRIDGE + ".saveFailed();};x.send();})("
                    + jsString(url) + "," + jsString(mimeType) + "," + jsString(fallbackName) + ");";
            web.evaluateJavascript(script, null);
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            if (mimeType != null && !mimeType.isEmpty()) request.setMimeType(mimeType);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
            request.setTitle(name);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            long id = ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
            openWhenDone.add(id);
            toast(getString(R.string.download_started, name));
        } catch (Exception error) {
            openOutside(Uri.parse(url));
        }
    }

    /** A PDF or file the app downloaded opens by itself when it is done (as "Tải PDF" does in a browser). */
    private void registerDownloadReceiver() {
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (!openWhenDone.remove(id)) return;
                try {
                    DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    Uri file = manager.getUriForDownloadedFile(id);
                    if (file == null) {
                        toast(getString(R.string.download_failed));
                        return;
                    }
                    String mime = manager.getMimeTypeForDownloadedFile(id);
                    Intent view = new Intent(Intent.ACTION_VIEW);
                    view.setDataAndType(file, mime == null || mime.isEmpty() ? "*/*" : mime);
                    view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(view);
                } catch (ActivityNotFoundException noViewer) {
                    toast(getString(R.string.no_app_for_file));
                } catch (Exception error) {
                    toast(getString(R.string.download_failed));
                }
            }
        };
        ContextCompat.registerReceiver(this, downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_EXPORTED);
    }

    private void cleanCameraFiles() {
        File[] old = new File(getCacheDir(), "camera").listFiles();
        if (old == null) return;
        long cutoff = System.currentTimeMillis() - CAMERA_FILE_MAX_AGE_MS;
        for (File file : old) {
            if (file.lastModified() < cutoff && !file.delete()) file.deleteOnExit();
        }
    }

    private static String jsString(String value) {
        if (value == null) return "''";
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "").replace("\r", "")
                .replace("<", "\\x3c") + "'";
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    /** Called from the page: saves a file it built (as a data: URL) into Downloads. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String dataUrl, String mimeType, String suggestedName) {
            runOnUiThread(() -> {
                try {
                    int comma = dataUrl.indexOf(',');
                    if (comma < 0) throw new IllegalArgumentException("data");
                    byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                    String mime = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType.split(";")[0].trim();
                    String name = safeName(suggestedName, mime);
                    if (Build.VERSION.SDK_INT >= 29) {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                        values.put(MediaStore.Downloads.MIME_TYPE, mime);
                        Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        if (item == null) throw new IllegalStateException("insert");
                        try (OutputStream out = getContentResolver().openOutputStream(item)) {
                            if (out == null) throw new IllegalStateException("open");
                            out.write(bytes);
                        }
                    } else {
                        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("dir");
                        try (FileOutputStream out = new FileOutputStream(new File(dir, name))) {
                            out.write(bytes);
                        }
                    }
                    toast(getString(R.string.download_saved, name));
                } catch (Exception error) {
                    toast(getString(R.string.download_failed));
                }
            });
        }

        @JavascriptInterface
        public void saveFailed() {
            runOnUiThread(() -> toast(getString(R.string.download_failed)));
        }
    }

    private static String safeName(String suggested, String mime) {
        String name = suggested == null ? "" : suggested.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) {
            String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
            name = "hien-xa-" + System.currentTimeMillis() + (extension == null ? "" : "." + extension);
        }
        return name;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        // Only the address: a WebView's full history can be too big for Android to keep and would close the app.
        if (web != null && !rendererGone) {
            String url = web.getUrl();
            if (url != null && isAppUrl(Uri.parse(url))) outState.putString(STATE_URL, url);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) {
            CookieManager.getInstance().flush();
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (downloadReceiver != null) {
            try {
                unregisterReceiver(downloadReceiver);
            } catch (IllegalArgumentException ignored) {
                // Not registered.
            }
        }
        if (web != null) {
            web.removeJavascriptInterface(BRIDGE);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
