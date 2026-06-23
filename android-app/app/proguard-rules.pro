# Keep WebViews and their javascript interface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keepclassmembers class * extends android.webkit.WebViewClient {
    public void *(***);
}
-keepclassmembers class * extends android.webkit.WebChromeClient {
    public void *(***);
}
