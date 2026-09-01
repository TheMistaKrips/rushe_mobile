import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
    StyleSheet,
    SafeAreaView,
    StatusBar,
    Platform,
    BackHandler,
    View,
    Text,
    TouchableOpacity,
    Image,
    Dimensions,
    ActivityIndicator
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

// Предотвращаем скрытие splash screen до загрузки
SplashScreen.preventAutoHideAsync();

const APP_URL = 'https://rushe-seven.vercel.app';
const { width, height } = Dimensions.get('window');

// Компонент мини-плеера
const MiniPlayer = ({ track, isPlaying, onPlayPause, onNext }) => {
    if (!track) return null;

    return (
        <View style={styles.miniPlayer}>
            <Image
                source={{ uri: track.cover || 'https://picsum.photos/seed/1/100/100' }}
                style={styles.miniCover}
            />
            <View style={styles.miniInfo}>
                <Text style={styles.miniTitle} numberOfLines={1}>
                    {track.title || 'Unknown'}
                </Text>
                <Text style={styles.miniArtist} numberOfLines={1}>
                    {track.artist || 'Unknown Artist'}
                </Text>
            </View>
            <TouchableOpacity onPress={onPlayPause} style={styles.miniButton}>
                <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={24}
                    color="#fff"
                />
            </TouchableOpacity>
            <TouchableOpacity onPress={onNext} style={styles.miniButton}>
                <Ionicons name="play-skip-forward" size={24} color="#fff" />
            </TouchableOpacity>
        </View>
    );
};

export default function App() {
    const webViewRef = useRef(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Состояние плеера
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrack, setCurrentTrack] = useState(null);
    const [playlist, setPlaylist] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Перехват сообщений из WebView
    const handleMessage = useCallback(async (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            console.log('📩 Получено из WebView:', data);

            switch (data.type) {
                case 'PLAY_TRACK':
                    // Получаем данные трека из WebView
                    const track = data.payload;
                    if (track && track.audioUrl) {
                        await playTrack(track, data.playlist || [track]);
                    }
                    break;

                case 'PLAY_PLAYLIST':
                    // Получаем плейлист
                    const newPlaylist = data.payload || [];
                    if (newPlaylist.length > 0) {
                        setPlaylist(newPlaylist);
                        if (data.currentIndex !== undefined) {
                            setCurrentIndex(data.currentIndex);
                            await playTrack(newPlaylist[data.currentIndex], newPlaylist);
                        } else {
                            setCurrentIndex(0);
                            await playTrack(newPlaylist[0], newPlaylist);
                        }
                    }
                    break;

                case 'PAUSE':
                    await pauseSound();
                    break;

                case 'RESUME':
                    await resumeSound();
                    break;

                case 'NEXT':
                    await playNext();
                    break;

                case 'VOLUME':
                    // Управление громкостью
                    if (sound) {
                        await sound.setVolumeAsync(data.payload || 0.8);
                    }
                    break;

                default:
                    break;
            }
        } catch (error) {
            console.error('❌ Ошибка обработки сообщения:', error);
        }
    }, [sound, playlist, currentIndex]);

    // Воспроизведение трека
    const playTrack = async (track, trackPlaylist = []) => {
        try {
            setIsLoading(true);

            // Останавливаем текущий трек
            if (sound) {
                await sound.unloadAsync();
                setSound(null);
            }

            if (!track || !track.audioUrl) {
                console.warn('⚠️ Нет audioUrl для трека');
                setIsLoading(false);
                return;
            }

            // Обновляем состояние
            setCurrentTrack(track);
            if (trackPlaylist.length > 0) {
                setPlaylist(trackPlaylist);
                const index = trackPlaylist.findIndex(t => t.id === track.id);
                if (index !== -1) setCurrentIndex(index);
            }
            setIsPlaying(true);

            // Создаем и загружаем звук
            const { sound: newSound } = await Audio.Sound.createAsync(
                { uri: track.audioUrl },
                { shouldPlay: true, volume: 1.0 },
                onPlaybackStatusUpdate
            );

            setSound(newSound);
            setIsLoading(false);

            // Отправляем статус в WebView
            sendToWebView({
                type: 'PLAYER_STATUS',
                payload: {
                    isPlaying: true,
                    track: track,
                    currentTime: 0,
                    duration: 0
                }
            });

        } catch (error) {
            console.error('❌ Ошибка воспроизведения:', error);
            setIsLoading(false);
            setIsPlaying(false);
        }
    };

    // Обновление статуса воспроизведения
    const onPlaybackStatusUpdate = (status) => {
        if (status.isLoaded) {
            if (status.didJustFinish) {
                // Трек закончился - играем следующий
                playNext();
            }

            // Отправляем статус в WebView
            sendToWebView({
                type: 'PLAYER_STATUS',
                payload: {
                    isPlaying: status.isPlaying,
                    currentTime: status.positionMillis / 1000,
                    duration: status.durationMillis / 1000,
                    track: currentTrack
                }
            });
        }
    };

    // Пауза
    const pauseSound = async () => {
        if (sound) {
            await sound.pauseAsync();
            setIsPlaying(false);
            sendToWebView({
                type: 'PLAYER_STATUS',
                payload: { isPlaying: false }
            });
        }
    };

    // Продолжить
    const resumeSound = async () => {
        if (sound) {
            await sound.playAsync();
            setIsPlaying(true);
            sendToWebView({
                type: 'PLAYER_STATUS',
                payload: { isPlaying: true }
            });
        }
    };

    // Следующий трек
    const playNext = async () => {
        if (playlist.length === 0) return;

        const nextIndex = (currentIndex + 1) % playlist.length;
        setCurrentIndex(nextIndex);
        await playTrack(playlist[nextIndex], playlist);
    };

    // Предыдущий трек
    const playPrevious = async () => {
        if (playlist.length === 0) return;

        const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
        setCurrentIndex(prevIndex);
        await playTrack(playlist[prevIndex], playlist);
    };

    // Отправка сообщений в WebView
    const sendToWebView = (data) => {
        if (webViewRef.current) {
            const message = JSON.stringify(data);
            webViewRef.current.postMessage(message);
            console.log('📤 Отправлено в WebView:', data);
        }
    };

    // Настройка аудио сессии для фонового воспроизведения
    useEffect(() => {
        const setupAudio = async () => {
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    staysActiveInBackground: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                });
                console.log('✅ Аудио сессия настроена для фона');
            } catch (error) {
                console.error('❌ Ошибка настройки аудио:', error);
            }
        };

        setupAudio();

        // Очистка при размонтировании
        return () => {
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, []);

    // Обработка кнопки "Назад" на Android
    useEffect(() => {
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
        setIsLoaded(true);
        SplashScreen.hideAsync();
    };

    // Инъекция JavaScript для связи с WebView
    const injectedJavaScript = `
        (function() {
            // Создаем глобальный объект для связи
            window.RNBridge = {
                sendMessage: function(data) {
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify(data));
                    }
                },
                onMessage: function(callback) {
                    window._rnCallback = callback;
                }
            };

            // Перехватываем вызовы из веб-приложения
            window.addEventListener('message', function(event) {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'PLAY_TRACK' || data.type === 'PLAY_PLAYLIST') {
                        window.ReactNativeWebView.postMessage(JSON.stringify(data));
                    }
                } catch(e) {}
            });

            // Отправляем сообщение о готовности
            window.RNBridge.sendMessage({
                type: 'READY',
                payload: { ready: true }
            });

            console.log('✅ RN Bridge initialized');
        })();
    `;

    // Инъекция для WebView (перехват кликов по трекам)
    const injectedJavaScriptBeforeContentLoaded = `
        (function() {
            // Перехватываем клики по трекам
            document.addEventListener('click', function(e) {
                const trackElement = e.target.closest('[data-track-id]');
                if (trackElement) {
                    try {
                        const trackData = JSON.parse(trackElement.dataset.trackData || '{}');
                        if (trackData && trackData.audioUrl) {
                            window.RNBridge.sendMessage({
                                type: 'PLAY_TRACK',
                                payload: trackData
                            });
                        }
                    } catch(e) {}
                }
            });
        })();
    `;

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
                onMessage={handleMessage}
                injectedJavaScript={injectedJavaScript}
                injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
                // Настройки для WebView
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback={true}
                allowsFullscreenVideo={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                allowsBackForwardNavigationGestures={true}
            // Для отладки
            // setBuiltInZoomControls={false}
            // showsVerticalScrollIndicator={false}
            />

            {/* Мини-плеер внизу */}
            {currentTrack && (
                <MiniPlayer
                    track={currentTrack}
                    isPlaying={isPlaying}
                    onPlayPause={() => {
                        if (isPlaying) {
                            pauseSound();
                        } else {
                            resumeSound();
                        }
                    }}
                    onNext={playNext}
                />
            )}

            {/* Индикатор загрузки */}
            {isLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#9B51E0" />
                </View>
            )}
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
    miniPlayer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 70,
        backgroundColor: 'rgba(20, 20, 30, 0.95)',
        backdropFilter: 'blur(20px)',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingBottom: Platform.OS === 'ios' ? 20 : 0,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    miniCover: {
        width: 48,
        height: 48,
        borderRadius: 8,
        marginRight: 12,
    },
    miniInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    miniTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    miniArtist: {
        color: '#888',
        fontSize: 12,
    },
    miniButton: {
        padding: 8,
        marginLeft: 4,
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});