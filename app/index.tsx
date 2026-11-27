import React, { useEffect, useCallback, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, FlatList, Pressable, Animated, StatusBar, Platform, BackHandler, ToastAndroid, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { api } from "@/services/api";
import VideoCard from "@/components/VideoCard";
import { useFocusEffect, useRouter } from "expo-router";
import { Search, Settings, LogOut, Heart } from "lucide-react-native";
import { StyledButton } from "@/components/StyledButton";
import useHomeStore, {
  RowItem,
  Category,
  FILTER_CATEGORY_OPTIONS,
  FILTER_YEAR_OPTIONS,
  REGION_OPTIONS,
  getGenreOptions,
} from "@/stores/homeStore";
import useAuthStore from "@/stores/authStore";
import CustomScrollView from "@/components/CustomScrollView";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { getCommonResponsiveStyles } from "@/utils/ResponsiveStyles";
import ResponsiveNavigation from "@/components/navigation/ResponsiveNavigation";
import { useApiConfig, getApiConfigErrorMessage } from "@/hooks/useApiConfig";
import { Colors } from "@/constants/Colors";

const LOAD_MORE_THRESHOLD = 200;

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = "dark";
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  // 响应式布局配置
  const responsiveConfig = useResponsiveLayout();
  const commonStyles = getCommonResponsiveStyles(responsiveConfig);
  const { deviceType, spacing } = responsiveConfig;

  // 每一条筛选行各自的横向 ScrollView，用于遥控焦点移动时自动跟随滚动
  const filterScrollRefs = useRef<Record<string, ScrollView | null>>({});
  // TV 下每个筛选按钮固定宽度，保证按焦点序号推算滚动位置是准确的
  const TV_FILTER_BTN_WIDTH = 124;
  const TV_FILTER_STEP = TV_FILTER_BTN_WIDTH + 8;

  const {
    categories,
    selectedCategory,
    contentData,
    loading,
    loadingMore,
    error,
    fetchInitialData,
    loadMoreData,
    selectCategory,
    refreshPlayRecords,
    clearError,
  } = useHomeStore();
  const { isLoggedIn, logout } = useAuthStore();
  const apiConfigStatus = useApiConfig();

  useFocusEffect(
    useCallback(() => {
      refreshPlayRecords();
    }, [refreshPlayRecords])
  );

    // 双击返回退出逻辑（只限当前页面）
  const backPressTimeRef = useRef<number | null>(null);

  useFocusEffect(
    useCallback(() => {
    const handleBackPress = () => {
      const now = Date.now();

      // 如果还没按过返回键，或距离上次超过2秒
      if (!backPressTimeRef.current || now - backPressTimeRef.current > 2000) {
        backPressTimeRef.current = now;
        ToastAndroid.show("再按一次返回键退出", ToastAndroid.SHORT);
        return true; // 拦截返回事件，不退出
      }

      // 两次返回键间隔小于2秒，退出应用
      BackHandler.exitApp();
      return true;
    };

    // 仅限 Android 平台启用此功能
    if (Platform.OS === "android") {
      const backHandler = BackHandler.addEventListener("hardwareBackPress", handleBackPress);

      // 返回首页时重置状态
      return () => {
        backHandler.remove();
        backPressTimeRef.current = null;
      };
    }
  }, [])
);

  // 统一的数据获取逻辑
  useEffect(() => {
    if (!selectedCategory) return;

    // 如果是容器分类且没有选择标签，设置默认标签
    if (selectedCategory.tags && !selectedCategory.tag) {
      const defaultTag = selectedCategory.tags[0];
      setSelectedTag(defaultTag);
      selectCategory({ ...selectedCategory, tag: defaultTag });
      return;
    }

    // 只有在API配置完成且分类有效时才获取数据
    if (apiConfigStatus.isConfigured && !apiConfigStatus.needsConfiguration) {
      // 对于有标签的分类，需要确保有标签才获取数据
      if (selectedCategory.tags && selectedCategory.tag) {
        fetchInitialData();
      }
      // 对于无标签的分类，直接获取数据
      else if (!selectedCategory.tags) {
        fetchInitialData();
      }
    }
  }, [
    selectedCategory,
    selectedCategory?.tag,
    apiConfigStatus.isConfigured,
    apiConfigStatus.needsConfiguration,
    fetchInitialData,
    selectCategory,
  ]);

  // 清除错误状态的逻辑
  useEffect(() => {
    if (apiConfigStatus.needsConfiguration && error) {
      clearError();
    }
  }, [apiConfigStatus.needsConfiguration, error, clearError]);

  useEffect(() => {
    if (!loading && contentData.length > 0) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else if (loading) {
      fadeAnim.setValue(0);
    }
  }, [loading, contentData.length, fadeAnim]);

  const handleCategorySelect = (category: Category) => {
    setSelectedTag(null);
    selectCategory(category);
  };

  const handleTagSelect = (tag: string) => {
    setSelectedTag(tag);
    if (selectedCategory) {
      const categoryWithTag = { ...selectedCategory, tag: tag };
      selectCategory(categoryWithTag);
    }
  };

  const renderCategory = ({ item }: { item: Category }) => {
    const isSelected = selectedCategory?.title === item.title;
    return (
      <StyledButton
        text={item.title}
        onPress={() => handleCategorySelect(item)}
        isSelected={isSelected}
        style={dynamicStyles.categoryButton}
        textStyle={dynamicStyles.categoryText}
      />
    );
  };

  const renderContentItem = ({ item }: { item: RowItem; index: number }) => (
    <VideoCard
      id={item.id}
      source={item.source}
      title={item.title}
      poster={item.poster}
      year={item.year}
      rate={item.rate}
      progress={item.progress}
      playTime={item.play_time}
      episodeIndex={item.episodeIndex}
      sourceName={item.sourceName}
      totalEpisodes={item.totalEpisodes}
      api={api}
      onRecordDeleted={fetchInitialData}
    />
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return <ActivityIndicator style={{ marginVertical: 20 }} size="large" />;
  };

  // 检查是否需要显示API配置提示
  const shouldShowApiConfig = apiConfigStatus.needsConfiguration && selectedCategory && !selectedCategory.tags;

  // TV端和平板端的顶部导航
  const renderHeader = () => {
    if (deviceType === "mobile") {
      // 移动端不显示顶部导航，使用底部Tab导航
      return null;
    }

    return (
      <View style={dynamicStyles.headerContainer}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <ThemedText style={dynamicStyles.headerTitle}>首页</ThemedText>
          <Pressable android_ripple={Platform.isTV || deviceType !== 'tv'? { color: 'transparent' } : { color: Colors.dark.link }} style={{ marginLeft: 20 }} onPress={() => router.push("/live")}>
            {({ focused }) => (
              <ThemedText style={[dynamicStyles.headerTitle, { color: focused ? "white" : "grey" }]}>直播</ThemedText>
            )}
          </Pressable>
        </View>
        <View style={dynamicStyles.rightHeaderButtons}>
          <StyledButton style={dynamicStyles.iconButton} onPress={() => router.push("/favorites")} variant="ghost">
            <Heart color={colorScheme === "dark" ? "white" : "black"} size={24} />
          </StyledButton>
          <StyledButton
            style={dynamicStyles.iconButton}
            onPress={() => router.push({ pathname: "/search" })}
            variant="ghost"
          >
            <Search color={colorScheme === "dark" ? "white" : "black"} size={24} />
          </StyledButton>
          <StyledButton style={dynamicStyles.iconButton} onPress={() => router.push("/settings")} variant="ghost">
            <Settings color={colorScheme === "dark" ? "white" : "black"} size={24} />
          </StyledButton>
          {isLoggedIn && (
            <StyledButton style={dynamicStyles.iconButton} onPress={logout} variant="ghost">
              <LogOut color={colorScheme === "dark" ? "white" : "black"} size={24} />
            </StyledButton>
          )}
        </View>
      </View>
    );
  };

  // 动态样式
  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: deviceType === "mobile" ? insets.top : deviceType === "tablet" ? insets.top + 20 : 40,
    },
    headerContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing * 1.5,
      marginBottom: spacing,
    },
    headerTitle: {
      fontSize: deviceType === "mobile" ? 24 : deviceType === "tablet" ? 28 : 32,
      fontWeight: "bold",
      paddingTop: 16,
    },
    rightHeaderButtons: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconButton: {
      borderRadius: 30,
      marginLeft: spacing / 2,
    },
    categoryContainer: {
      paddingBottom: spacing / 2,
    },
    categoryListContent: {
      paddingHorizontal: spacing,
    },
    categoryButton: {
      paddingHorizontal: deviceType === "tv" ? spacing / 4 : spacing / 2,
      paddingVertical: spacing / 2,
      borderRadius: deviceType === "mobile" ? 6 : 8,
      marginHorizontal: deviceType === "tv" ? spacing / 4 : spacing / 2, // TV端使用更小的间距
    },
    categoryText: {
      fontSize: deviceType === "mobile" ? 14 : 16,
      fontWeight: "500",
    },
    contentContainer: {
      flex: 1,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      // TV 上横向 FlatList 没有确定高度会塌成 0，导致右边的选项按钮整片不渲染，
      // 只剩左边的「分类 / 类型 / 地区 / 年份」标签
      // 电视安全区边界会裁掉贴边内容，左右留够余量
      paddingHorizontal: deviceType === "tv" ? spacing * 1.5 : spacing,
      height: deviceType === "tv" ? 60 : 48,
    },
    filterLabel: {
      width: deviceType === "tv" ? 64 : 36,
      fontSize: deviceType === "mobile" ? 12 : 15,
      opacity: 0.75,
      paddingLeft: deviceType === "tv" ? 4 : 0,
    },
    filterScrollWrap: {
      flex: 1,
      height: "100%",
      justifyContent: "center",
    },
    tvFilterButton: {
      width: TV_FILTER_BTN_WIDTH,
      marginHorizontal: 4,
    },
    moreHint: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: 24,
      justifyContent: "center",
      alignItems: "flex-end",
    },
    moreHintText: {
      fontSize: 20,
      opacity: 0.45,
    },
    filterList: {
      flex: 1,
      height: "100%",
    },
  });

  // 筛选行（分类 / 类型 / 地区 / 年份），仅在 filterKind 分类下渲染
  // 这里用 ScrollView + View 手排，不用 FlatList：
  // Android TV 上横向 FlatList 会因为父容器高度/虚拟化裁剪把按钮整行吃掉，
  // 只剩左侧标签，实测就是「分类 类型 地区 年份」四个字孤零零挂着。
  const renderFilterRow = (
    label: string,
    options: string[],
    current: string,
    onSelect: (value: string) => void
  ) => (
    <View style={dynamicStyles.filterRow}>
      <ThemedText style={dynamicStyles.filterLabel}>{label}</ThemedText>
      <View style={dynamicStyles.filterScrollWrap}>
        <ScrollView
          ref={(r) => {
            filterScrollRefs.current[label] = r;
          }}
          horizontal
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews={false}
          contentContainerStyle={[
            dynamicStyles.categoryListContent,
            { alignItems: "center" },
          ]}
          style={dynamicStyles.filterList}
        >
          {options.map((item, index) => (
            <StyledButton
              key={`${label}-${item}`}
              text={item}
              onPress={() => onSelect(item)}
              // 焦点走到屏幕外时自动把这一行横向滚过去，否则右侧选项永远看不到
              onFocus={() => {
                if (deviceType !== "tv") return;
                const scroller = filterScrollRefs.current[label];
                if (!scroller) return;
                const targetX =
                  index < 4 ? 0 : (index - 2) * TV_FILTER_STEP;
                scroller.scrollTo({ x: Math.max(0, targetX), animated: true });
              }}
              isSelected={current === item}
              style={
                deviceType === "tv"
                  ? dynamicStyles.tvFilterButton
                  : dynamicStyles.categoryButton
              }
              textStyle={dynamicStyles.categoryText}
              variant="ghost"
            />
          ))}
        </ScrollView>
        {options.length > 6 && deviceType === "tv" && (
          <View pointerEvents="none" style={dynamicStyles.moreHint}>
            <ThemedText style={dynamicStyles.moreHintText}>›</ThemedText>
          </View>
        )}
      </View>
    </View>
  );

  const content = (
    <ThemedView style={[commonStyles.container, dynamicStyles.container]}>
      {/* 状态栏 */}
      {deviceType === "mobile" && <StatusBar barStyle="light-content" />}

      {/* 顶部导航 */}
      {renderHeader()}

      {/* 分类选择器 */}
      <View style={dynamicStyles.categoryContainer}>
        <FlatList
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.title}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={dynamicStyles.categoryListContent}
        />
      </View>

      {/* 四段筛选：分类 / 类型 / 地区 / 年份 */}
      {selectedCategory && selectedCategory.filterKind && (
        <>
          {renderFilterRow(
            "分类",
            FILTER_CATEGORY_OPTIONS,
            selectedCategory.filterCategory || "热门",
            (value) =>
              selectCategory({ ...selectedCategory, filterCategory: value })
          )}
          {renderFilterRow(
            "类型",
            getGenreOptions(selectedCategory.filterKind),
            selectedCategory.filterGenre || "全部",
            (value) =>
              selectCategory({ ...selectedCategory, filterGenre: value })
          )}
          {renderFilterRow(
            "地区",
            REGION_OPTIONS,
            selectedCategory.filterRegion || "全部",
            (value) =>
              selectCategory({ ...selectedCategory, filterRegion: value })
          )}
          {renderFilterRow(
            "年份",
            FILTER_YEAR_OPTIONS,
            selectedCategory.filterYear || "全部",
            (value) => selectCategory({ ...selectedCategory, filterYear: value })
          )}
        </>
      )}

      {/* 子分类标签 */}
      {selectedCategory && selectedCategory.tags && (
        <View style={dynamicStyles.categoryContainer}>
          <FlatList
            data={selectedCategory.tags}
            renderItem={({ item, index }) => {
              const isSelected = selectedTag === item;
              return (
                <StyledButton
                  hasTVPreferredFocus={index === 0}
                  text={item}
                  onPress={() => handleTagSelect(item)}
                  isSelected={isSelected}
                  style={dynamicStyles.categoryButton}
                  textStyle={dynamicStyles.categoryText}
                  variant="ghost"
                />
              );
            }}
            keyExtractor={(item) => item}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={dynamicStyles.categoryListContent}
          />
        </View>
      )}

      {/* 内容网格 */}
      {shouldShowApiConfig ? (
        <View style={commonStyles.center}>
          <ThemedText type="subtitle" style={{ padding: spacing, textAlign: "center" }}>
            {getApiConfigErrorMessage(apiConfigStatus)}
          </ThemedText>
        </View>
      ) : apiConfigStatus.isValidating ? (
        <View style={commonStyles.center}>
          <ActivityIndicator size="large" />
          <ThemedText type="subtitle" style={{ padding: spacing, textAlign: "center" }}>
            正在验证服务器配置...
          </ThemedText>
        </View>
      ) : apiConfigStatus.error && !apiConfigStatus.isValid ? (
        <View style={commonStyles.center}>
          <ThemedText type="subtitle" style={{ padding: spacing, textAlign: "center" }}>
            {apiConfigStatus.error}
          </ThemedText>
        </View>
      ) : loading ? (
        <View style={commonStyles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={commonStyles.center}>
          <ThemedText type="subtitle" style={{ padding: spacing }}>
            {error}
          </ThemedText>
        </View>
      ) : (
        <Animated.View style={[dynamicStyles.contentContainer, { opacity: fadeAnim }]}>
          <CustomScrollView
            data={contentData}
            renderItem={renderContentItem}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            onEndReached={loadMoreData}
            loadMoreThreshold={LOAD_MORE_THRESHOLD}
            emptyMessage={selectedCategory?.tags ? "请选择一个子分类" : "该分类下暂无内容"}
            ListFooterComponent={renderFooter}
          />
        </Animated.View>
      )}
    </ThemedView>
  );

  // 根据设备类型决定是否包装在响应式导航中
  if (deviceType === "tv") {
    return content;
  }

  return <ResponsiveNavigation>{content}</ResponsiveNavigation>;
}
