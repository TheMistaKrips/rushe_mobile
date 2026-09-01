import React, { useRef, useState, useEffect } from 'react';
import { 
    StyleSheet, 
    SafeAreaView, 
    StatusBar, 
    Platform, 
    BackHandler,
    Alert,
    Dimensions
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

// Предотвращаем скрытие splash screen до загрузки
SplashScreen.preventAutoHideAsync();

const APP_URL = 'https://rushe-seven.vercel.app';

export default function App() {
    const webViewRef = useRef(null);
    const [canGoBack, setCanGoBack] = useState(false);

    useEffect(() => {
        // Обработка кнопки "Назад" на Android
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return true;
            }
            return false;
        });

        return () => backHandler.remove();
    }, [canGoBack]);

    // Скрываем splash screen после загрузки
    const handleLoadEnd = () => {
        SplashScreen.hideAsync();
    };

    return (
        <SafeAreaView style={styles.container}>
            <ExpoStatusBar style="light" backgroundColor="#0d0d12" />
            <StatusBar barStyle="light-content" backgroundColor="#0d0d12" />
            
            <WebView
                ref={webViewRef}
                source={{ uri: APP_URL }}
                style={styles.webview}
                onLoadEnd={handleLoadEnd}
                onNavigationStateChange={(navState) => {
                    setCanGoBack(navState.canGoBack);
                }}
                // Для фонового воспроизведения на iOS
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback={true}
                allowsFullscreenVideo={true}
                // Настройки для лучшей производительности
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                // Для отладки
                // setBuiltInZoomControls={false}
                // showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0d0d12',
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    webview: {
        flex: 1,
        backgroundColor: '#0d0d12',
    },
});