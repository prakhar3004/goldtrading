package com.example.kuberkhajana

import android.app.Activity
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
  private lateinit var webView: WebView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Clear cookies to ensure fresh state
    CookieManager.getInstance().removeAllCookies(null)

    webView = WebView(this).apply {
      // Clear cache on startup
      clearCache(true)

      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.useWideViewPort = true
      settings.loadWithOverviewMode = true
      settings.cacheMode = WebSettings.LOAD_NO_CACHE
      
      webViewClient = object : WebViewClient() {
        @Deprecated("Deprecated in Java")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
          // Returning false allows the WebView to handle the redirects and page loading internally
          return false
        }
      }
      
      loadUrl("https://kuberkhajana.vercel.app/")
    }

    setContentView(webView)
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (::webView.isInitialized && webView.canGoBack()) {
      webView.goBack()
    } else {
      super.onBackPressed()
    }
  }
}


