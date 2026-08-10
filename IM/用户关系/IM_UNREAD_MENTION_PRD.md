---
meta:
  title: "IM-私聊/群聊能力优化：未读消息定位 + 群聊@功能"
  version: "1.0.0"
  status: approved
  author: "产品团队"
  created: "2026-06-15"
  updated: "2026-06-15"

project:
  name: "Vone/Poppo IM"
  platform: [ios, android]
  tech_stack: native
  min_os: { ios: "15.0", android: "8.0" }

priority: P1
estimated_effort: "10d"

dependencies:
  - type: design
    name: "Vone UI设计稿"
    status: ready
    doc: "https://lanhuapp.com/link/#/invite?sid=lX0TZ7vy"
  - type: design
    name: "Poppo UI设计稿"
    status: ready
    doc: "https://lanhuapp.com/link/#/invite?sid=lx0xfLIJ"
  - type: api
    name: "IM消息服务"
    status: ready
  - type: api
    name: "群成员服务"
    status: ready
---

# IM-私聊/群聊能力优化：未读消息定位 + 群聊@功能

## 1. 功能概述

### 1.1 背景与目标

> **一句话描述：** 为私聊/群聊补齐未读消息定位和群聊@能力，提升沟通效率与群管理体验。

**业务目标：**
- 用户能快速定位未读消息，减少手动翻找时间
- 群内用户能通过@精准召回或点名沟通，形成有效社交互动
- 提升群聊消息触达率和用户回复率

**成功指标：**
| 指标 | 当前值 | 目标值 | 统计方式 |
|------|--------|--------|----------|
| 群消息回复率 | - | +15% | 埋点统计 |
| 未读消息定位按钮点击率 | 0 | >30% | 埋点统计 |
| @消息触达后回复率 | 0 | >40% | 埋点统计 |

### 1.2 用户故事

```yaml
user_stories:
  - id: US-001
    role: "私聊/群聊用户"
    action: "点击新消息按钮快速定位到未读消息"
    benefit: "无需手动翻找历史消息，快速了解未读内容"
    acceptance:
      - "未读消息超出可视区域时显示定位按钮"
      - "点击按钮自动跳转到最早未读消息"
      - "跳转后显示 New Message 分割线"

  - id: US-002
    role: "群聊用户"
    action: "在群聊中@指定用户发送消息"
    benefit: "精准通知目标用户，提高消息触达率"
    acceptance:
      - "长按头像或输入@触发@功能"
      - "@昵称高亮展示"
      - "被@用户收到通知提醒"

  - id: US-003
    role: "群主/管理员"
    action: "在群聊中@所有人发送通知"
    benefit: "群公告类消息能触达全部成员"
    acceptance:
      - "@列表第一位显示'所有人'选项"
      - "所有群成员收到@通知"

  - id: US-004
    role: "被@用户"
    action: "收到@提醒后快速定位到@消息"
    benefit: "不遗漏重要的@消息"
    acceptance:
      - "会话列表显示红色@标识"
      - "进入聊天页可通过按钮跳转到@消息"
      - "Push通知格式：[nickname] mention you：消息内容"

  - id: US-005
    role: "群聊用户"
    action: "设置群通知偏好（全部/有人@我/都不通知）"
    benefit: "按需控制群消息打扰程度"
    acceptance:
      - "免打扰改为'通知'按钮，点击弹出三选一"
      - "选择'有人@我'时仅@消息触发通知"
      - "选择'都不通知'时所有消息均不触发通知"
```

---

## 2. 数据模型

```typescript
// ========== 未读消息定位相关 ==========

interface UnreadInfo {
  conversation_id: string;           // 会话ID
  unread_count: number;              // 未读消息数
  first_unread_msg_id: string;       // 最早未读消息ID
  first_unread_msg_seq: number;      // 最早未读消息序号
  last_read_msg_id: string;          // 最后已读消息ID
}

interface NewMessageIndicator {
  type: "history" | "realtime";      // history=历史未读, realtime=实时新消息
  position: "top_right" | "bottom_right"; // history在右上, realtime在右下
  count: number;                     // 未读数
  display_count: string;             // 展示文案: "5" 或 "99+"
  target_msg_id: string;             // 跳转目标消息ID
  is_visible: boolean;               // 是否可见
}

// ========== @功能相关 ==========

interface MentionInfo {
  mention_type: "user" | "all";      // @指定用户 或 @所有人
  user_id?: string;                  // 被@用户ID（type=user时必填）
  nickname: string;                  // 展示昵称
  offset: number;                    // @文本在消息中的起始位置
  length: number;                    // @文本长度（含@符号和昵称）
}

interface ChatMessage {
  msg_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  mentions: MentionInfo[];           // 消息中的@列表
  created_at: string;                // ISO 8601
  seq: number;                       // 消息序号
}

interface MentionNotification {
  conversation_id: string;
  msg_id: string;
  mentioner_id: string;              // 谁@了我
  mentioner_nickname: string;
  mention_type: "user" | "all";
  is_read: boolean;                  // 是否已读该@消息
  created_at: string;
}

interface GroupMember {
  user_id: string;
  nickname: string;
  avatar_url: string;
  role: "owner" | "admin" | "member"; // 群主/管理员/普通成员
  join_time: string;
}

// ========== 通知设置相关 ==========

type NotificationLevel = "all" | "mention_only" | "none";
// all = 全部通知（默认）
// mention_only = 仅@我时通知
// none = 都不通知

interface ConversationNotificationSetting {
  conversation_id: string;
  level: NotificationLevel;
}
```

---

## 3. API 契约

### 3.1 获取会话未读信息

```yaml
api:
  id: API-001
  method: GET
  path: /api/v2/im/conversations/{conversation_id}/unread
  auth: required
  description: "获取指定会话的未读消息信息，用于定位按钮展示"

  request:
    path_params:
      conversation_id:
        type: string
        required: true

  response:
    success:
      status: 200
      body:
        code: 0
        data:
          unread_count: integer
          first_unread_msg_id: string
          first_unread_msg_seq: number
          last_read_msg_id: string

    errors:
      - status: 401
        code: 10001
        message: "未登录"
        action: "跳转登录页"
      - status: 404
        code: 20001
        message: "会话不存在"
        action: "toast提示并返回上一页"
```

### 3.2 获取群成员列表（@列表用）

```yaml
api:
  id: API-002
  method: GET
  path: /api/v2/im/groups/{group_id}/members
  auth: required
  description: "获取群成员列表，用于@选择列表"

  request:
    path_params:
      group_id:
        type: string
        required: true
    query:
      keyword:
        type: string
        required: false
        description: "搜索关键词，匹配昵称"
      page:
        type: integer
        default: 1
      page_size:
        type: integer
        default: 50
        range: [1, 100]

  response:
    success:
      status: 200
      body:
        code: 0
        data:
          total: integer
          list: GroupMember[]
          my_role: "owner" | "admin" | "member"  # 当前用户角色，决定是否展示@所有人
```

### 3.3 发送含@的消息

```yaml
api:
  id: API-003
  method: POST
  path: /api/v2/im/messages
  auth: required
  description: "发送消息，含@信息"

  request:
    body:
      conversation_id:
        type: string
        required: true
      content:
        type: string
        required: true
        max_length: 5000
      mentions:
        type: MentionInfo[]
        required: false
        description: "消息中的@列表"

  response:
    success:
      status: 200
      body:
        code: 0
        data:
          msg_id: string
          created_at: string
          seq: number

    errors:
      - status: 400
        code: 30001
        message: "消息内容超出字数限制"
        action: "toast: '已超过最大字数限制'"
      - status: 403
        code: 30002
        message: "无@所有人权限"
        action: "toast提示无权限，移除@所有人标记"
```

### 3.4 获取被@消息列表

```yaml
api:
  id: API-004
  method: GET
  path: /api/v2/im/conversations/{conversation_id}/mentions
  auth: required
  description: "获取当前用户在该会话中被@的未读消息"

  request:
    path_params:
      conversation_id:
        type: string
        required: true

  response:
    success:
      status: 200
      body:
        code: 0
        data:
          mention_count: integer
          first_mention_msg_id: string   # 最早被@消息ID
          mentions: MentionNotification[]
```

### 3.5 设置会话通知级别

```yaml
api:
  id: API-005
  method: PUT
  path: /api/v2/im/conversations/{conversation_id}/notification
  auth: required
  description: "设置会话通知偏好"

  request:
    path_params:
      conversation_id:
        type: string
        required: true
    body:
      level:
        type: string
        required: true
        enum: ["all", "mention_only", "none"]

  response:
    success:
      status: 200
      body:
        code: 0
        message: "success"
```

---

## 4. 页面与组件

### 4.1 页面清单

```yaml
pages:
  - id: PAGE-001
    name: "聊天页面（私聊/群聊共用）"
    route: "/im/chat/{conversation_id}"
    tech: native
    components:
      - ref: COMP-001  # 新消息定位按钮（历史未读）
      - ref: COMP-002  # 新消息定位按钮（实时新消息）
      - ref: COMP-003  # @提及定位按钮
      - ref: COMP-004  # 新消息分割线
      - ref: COMP-005  # @选择列表
      - ref: COMP-006  # @昵称高亮文本

  - id: PAGE-002
    name: "群通知设置弹窗"
    route: "modal"
    tech: native
    components:
      - ref: COMP-007  # 通知级别选择弹窗
```

### 4.2 组件定义

#### COMP-001: 历史未读消息定位按钮

```yaml
component:
  id: COMP-001
  name: HistoryUnreadButton
  description: "历史未读消息定位按钮，显示在聊天页面右上角"

  props:
    - name: unreadCount
      type: number
      required: true
      description: "未读消息数（固定值，不随新消息变化）"
    - name: targetMsgId
      type: string
      required: true
      description: "跳转目标：最早未读消息ID"
    - name: onPress
      type: "() => void"
      required: true
    - name: isVisible
      type: boolean
      required: true

  layout:
    type: horizontal
    position: "absolute, top_right"
    margin_right: 16
    margin_top: 8
    children:
      - element: Container
        background: "$color-bg-white"
        shadow: "$shadow-md"
        corner_radius: 20
        padding: { h: 12, v: 8 }
        children:
          - element: Icon
            name: "arrow_up"
            size: 16
            color: "$color-brand-500"
          - element: Text
            content: "${formatCount(unreadCount)} New Message${unreadCount > 1 ? 's' : ''}"
            style: "body_s"
            color: "$color-brand-500"

  states:
    - name: visible
      description: "按钮可见"
      animation: "fade_in, 200ms"
    - name: hidden
      description: "按钮不可见"
      animation: "fade_out, 150ms"
    - name: pressed
      description: "按下态"
      transform: "scale(0.95)"
      opacity: 0.8

  events:
    - name: onPress
      trigger: "tap"
      action: "scrollToMessage(targetMsgId) + showDivider(targetMsgId) + hide()"

  visibility_rules:
    show_when:
      - "unreadCount > 0"
      - "firstUnreadMessage 超出可视区域上方"
      - "没有被@消息需要展示（@按钮优先级更高）"
    hide_when:
      - "点击按钮完成跳转"
      - "用户手动滑动至最早未读消息位置"
      - "退出聊天页面"
```

#### COMP-002: 实时新消息定位按钮

```yaml
component:
  id: COMP-002
  name: RealtimeNewMessageButton
  description: "实时新消息定位按钮，显示在聊天页面右下角"

  props:
    - name: newMsgCount
      type: number
      required: true
      description: "新消息数（动态变化，随新消息递增）"
    - name: targetMsgId
      type: string
      required: true
      description: "跳转目标：最新未读消息ID"
    - name: onPress
      type: "() => void"
      required: true
    - name: isVisible
      type: boolean
      required: true

  layout:
    type: horizontal
    position: "absolute, bottom_right"
    margin_right: 16
    margin_bottom: 60  # 在输入框上方
    children:
      - element: Container
        background: "$color-bg-white"
        shadow: "$shadow-md"
        corner_radius: 20
        padding: { h: 12, v: 8 }
        children:
          - element: Icon
            name: "arrow_down"
            size: 16
            color: "$color-brand-500"
          - element: Text
            content: "${formatCount(newMsgCount)} New Message${newMsgCount > 1 ? 's' : ''}"
            style: "body_s"
            color: "$color-brand-500"

  states:
    - name: visible
      animation: "slide_up + fade_in, 200ms"
    - name: hidden
      animation: "fade_out, 150ms"

  events:
    - name: onPress
      trigger: "tap"
      action: "scrollToMessage(targetMsgId) + hide()"

  visibility_rules:
    show_when:
      - "用户已离开消息列表底部（不再自动跟随新消息）"
      - "收到新消息"
    hide_when:
      - "点击按钮完成跳转"
      - "用户手动滑动至消息列表底部"
      - "退出聊天页面"
```

#### COMP-003: @提及定位按钮

```yaml
component:
  id: COMP-003
  name: MentionLocateButton
  description: "@消息定位按钮，显示在聊天页面右上角（优先级高于历史未读按钮）"

  props:
    - name: mentionCount
      type: number
      required: true
      description: "被@未读消息数"
    - name: targetMsgId
      type: string
      required: true
      description: "跳转目标：最早被@消息ID"
    - name: onPress
      type: "() => void"
      required: true

  layout:
    type: horizontal
    position: "absolute, top_right"
    margin_right: 16
    margin_top: 8
    children:
      - element: Container
        background: "$color-bg-white"
        shadow: "$shadow-md"
        corner_radius: 20
        padding: { h: 12, v: 8 }
        children:
          - element: Icon
            name: "at_sign"
            size: 16
            color: "$color-danger-500"
          - element: Text
            content: "${formatCount(mentionCount)} New mention${mentionCount > 1 ? 's' : ''}"
            style: "body_s"
            color: "$color-danger-500"

  events:
    - name: onPress
      trigger: "tap"
      action: "scrollToMessage(targetMsgId) + highlightMessage(targetMsgId) + hide()"

  priority_rules:
    - "历史消息同时有被@和普通未读 → 只显示@按钮，隐藏历史未读按钮"
    - "实时新消息中包含@消息 → 只显示实时新消息按钮（不单独显示@按钮）"

  visibility_rules:
    show_when:
      - "被@消息已成为历史消息，超出可视区域"
    hide_when:
      - "点击按钮跳转到@消息"
      - "手动滑动至@消息位置"
      - "退出聊天页面"
```

#### COMP-004: 新消息分割线

```yaml
component:
  id: COMP-004
  name: NewMessageDivider
  description: "历史未读消息分割提示线，点击历史未读按钮后显示在最早未读消息上方"

  props:
    - name: isVisible
      type: boolean
      required: true

  layout:
    type: horizontal
    alignment: center
    margin: { h: 40, v: 8 }
    children:
      - element: Divider
        color: "$color-brand-300"
        thickness: 1
        flex: 1
      - element: Text
        content: "New Messages"
        style: "caption"
        color: "$color-brand-500"
        margin: { h: 8 }
      - element: Divider
        color: "$color-brand-300"
        thickness: 1
        flex: 1

  lifecycle:
    - "仅在点击历史未读按钮跳转后显示"
    - "手动滑动到未读消息位置时不显示"
    - "退出聊天页面后重新进入，分割线消失"
```

#### COMP-005: @选择列表

```yaml
component:
  id: COMP-005
  name: MentionPickerList
  description: "输入@后弹出的成员选择列表"

  props:
    - name: members
      type: GroupMember[]
      required: true
    - name: myRole
      type: "'owner' | 'admin' | 'member'"
      required: true
      description: "当前用户角色，决定是否展示@所有人"
    - name: onSelect
      type: "(member: GroupMember | 'all') => void"
      required: true
    - name: onDismiss
      type: "() => void"
      required: true

  layout:
    type: vertical
    position: "above_input_box"
    max_height: "50% of screen"
    background: "$color-bg-white"
    corner_radius: { top_left: 12, top_right: 12 }
    shadow: "$shadow-lg"
    children:
      - element: ConditionalRender
        condition: "myRole === 'owner' || myRole === 'admin'"
        children:
          - element: MemberRow
            avatar: "all_icon"
            nickname: "所有人"
            on_tap: "onSelect('all')"
      - element: FlatList
        data: "members.filter(m => m.user_id !== currentUserId)"  # 不展示自己
        render_item:
          element: MemberRow
          avatar: "item.avatar_url"
          nickname: "item.nickname"
          selected: "item.isSelected"
          on_tap: "onSelect(item)"

  states:
    - name: visible
      animation: "slide_up, 200ms"
    - name: hidden
      animation: "slide_down, 150ms"

  dismiss_rules:
    - "输入@后继续输入非选择操作的文字 → 列表收起"
    - "点击空白区域 → 列表收起"
    - "选择完成员后 → 列表收起"
```

#### COMP-006: @昵称高亮文本

```yaml
component:
  id: COMP-006
  name: MentionHighlightText
  description: "消息气泡中@昵称的高亮展示"

  props:
    - name: text
      type: string
      required: true
    - name: mentions
      type: MentionInfo[]
      required: true
    - name: onMentionPress
      type: "(mention: MentionInfo) => void"
      required: true

  rendering_rules:
    - "根据 mentions 中的 offset + length 标记高亮区域"
    - "@昵称文字颜色: $color-brand-500"
    - "点击@用户昵称 → 跳转用户个人主页"
    - "点击@所有人 → 无反应（不可点击）"
```

#### COMP-007: 通知级别选择弹窗

```yaml
component:
  id: COMP-007
  name: NotificationLevelSheet
  description: "群通知设置弹窗，底部弹出单选"

  props:
    - name: currentLevel
      type: NotificationLevel
      required: true
    - name: onSelect
      type: "(level: NotificationLevel) => void"
      required: true
    - name: onDismiss
      type: "() => void"
      required: true

  layout:
    type: vertical
    position: "bottom_sheet"
    background: "$color-bg-white"
    corner_radius: { top_left: 16, top_right: 16 }
    children:
      - element: Text
        content: "通知设置"
        style: "title_m"
        alignment: center
        margin: { top: 16, bottom: 12 }
      - element: RadioGroup
        value: "currentLevel"
        options:
          - value: "all"
            label: "全部"
            description: "接收所有消息通知"
          - value: "mention_only"
            label: "有人@我"
            description: "仅在被@时接收通知"
          - value: "none"
            label: "都不通知"
            description: "关闭所有消息通知"
        on_change: "onSelect(value)"
```

---

## 5. 交互与状态机

### 5.1 聊天页面定位按钮状态机

```yaml
state_machine:
  id: SM-001
  name: "聊天页面定位按钮管理"
  description: "管理历史未读按钮、实时新消息按钮、@按钮的显示/隐藏/优先级"

  context:
    history_unread_count: number       # 历史未读数（进入页面时确定，固定值）
    realtime_new_count: number         # 实时新消息数（动态递增）
    mention_count: number              # 被@未读数
    is_at_bottom: boolean              # 是否在消息列表底部
    first_unread_visible: boolean      # 最早未读消息是否在可视区域
    mention_msg_visible: boolean       # 被@消息是否在可视区域

  # === 历史未读按钮状态 ===
  history_button:
    initial: evaluating

    states:
      evaluating:
        description: "进入页面时评估是否需要显示"
        transitions:
          - event: HAS_UNREAD_ABOVE
            guard: "history_unread_count > 0 && !first_unread_visible && mention_count === 0"
            target: visible
          - event: HAS_MENTION
            guard: "mention_count > 0"
            target: hidden_by_mention
          - event: NO_UNREAD
            target: hidden

      visible:
        description: "按钮可见，显示在右上角"
        ui: "HistoryUnreadButton(count=history_unread_count)"
        transitions:
          - event: BUTTON_PRESSED
            target: hidden
            action: "scrollToFirstUnread() + showDivider()"
          - event: SCROLL_TO_UNREAD
            target: hidden
            action: "不显示分割线"
          - event: EXIT_PAGE
            target: hidden
          - event: MENTION_APPEARED
            guard: "mention_count > 0"
            target: hidden_by_mention

      hidden_by_mention:
        description: "被@按钮优先级更高，历史未读按钮隐藏"
        transitions:
          - event: MENTION_CLEARED
            guard: "history_unread_count > 0 && !first_unread_visible"
            target: visible
          - event: EXIT_PAGE
            target: hidden

      hidden:
        description: "按钮不可见"
        terminal: true

  # === 实时新消息按钮状态 ===
  realtime_button:
    initial: monitoring

    states:
      monitoring:
        description: "监听新消息"
        transitions:
          - event: NEW_MESSAGE_RECEIVED
            guard: "!is_at_bottom"
            target: visible
            action: "realtime_new_count++"

      visible:
        description: "按钮可见，显示在右下角，数字动态变化"
        ui: "RealtimeNewMessageButton(count=realtime_new_count)"
        transitions:
          - event: NEW_MESSAGE_RECEIVED
            target: visible
            action: "realtime_new_count++"
          - event: BUTTON_PRESSED
            target: monitoring
            action: "scrollToLatestMessage() + resetCount()"
          - event: SCROLL_TO_BOTTOM
            target: monitoring
            action: "resetCount()"
          - event: EXIT_PAGE
            target: monitoring
            action: "resetCount()"

  # === @定位按钮状态 ===
  mention_button:
    initial: evaluating

    states:
      evaluating:
        description: "进入页面时评估是否有未读@消息"
        transitions:
          - event: HAS_MENTION_ABOVE
            guard: "mention_count > 0 && !mention_msg_visible"
            target: visible
          - event: NO_MENTION
            target: hidden

      visible:
        description: "按钮可见，显示在右上角（替代历史未读按钮位置）"
        ui: "MentionLocateButton(count=mention_count)"
        transitions:
          - event: BUTTON_PRESSED
            target: hidden
            action: "scrollToFirstMention() + highlightMessage()"
          - event: SCROLL_TO_MENTION
            target: hidden
          - event: EXIT_PAGE
            target: hidden

      hidden:
        description: "按钮不可见"
```

### 5.2 @选择列表状态机

```yaml
state_machine:
  id: SM-002
  name: "@选择列表交互状态"
  initial: idle

  states:
    idle:
      description: "输入框正常状态"
      transitions:
        - event: INPUT_AT_SYMBOL
          target: list_visible
          action: "fetchMembers() + showList()"
        - event: LONG_PRESS_AVATAR
          target: idle
          action: "insertMention(user) — 不弹列表，直接插入"

    list_visible:
      description: "@列表展示中"
      ui: "MentionPickerList"
      transitions:
        - event: SELECT_MEMBER
          target: idle
          action: "insertMention(selectedMember) + dismissList()"
        - event: SELECT_ALL
          guard: "myRole === 'owner' || myRole === 'admin'"
          target: idle
          action: "insertMention('all') + dismissList()"
        - event: CONTINUE_TYPING
          target: idle
          action: "dismissList()"
        - event: TAP_BLANK_AREA
          target: idle
          action: "dismissList()"
        - event: CHAR_LIMIT_REACHED
          target: idle
          action: "toast('已超过最大字数限制') + dismissList()"
```

---

## 6. 设计规范引用

```yaml
design:
  vone_ui: "https://lanhuapp.com/link/#/invite?sid=lX0TZ7vy"
  poppo_ui: "https://lanhuapp.com/link/#/invite?sid=lx0xfLIJ"

  tokens:
    colors:
      brand_500: "$color-brand-500"
      brand_300: "$color-brand-300"
      danger_500: "$color-danger-500"        # @标识红色
      text_primary: "$color-text-900"
      text_secondary: "$color-text-500"
      bg_white: "$color-bg-white"
    spacing:
      button_padding_h: 12
      button_padding_v: 8
      button_margin: 16
    typography:
      body_s: "$font-body-s"                 # 按钮文案
      caption: "$font-caption"               # 分割线文案
    shadow:
      button_shadow: "$shadow-md"            # 定位按钮阴影
    radius:
      button: 20                             # 按钮圆角
      sheet_top: 16                          # 底部弹窗顶部圆角
      picker: 12                             # @列表顶部圆角
```

---

## 7. 埋点与监控

```yaml
tracking:
  # === 未读消息定位 ===
  - id: EVT-001
    name: "im_unread_button_show"
    trigger: "历史未读按钮展示"
    params:
      conversation_type: "private" | "group"
      unread_count: integer
      button_type: "history" | "realtime" | "mention"

  - id: EVT-002
    name: "im_unread_button_click"
    trigger: "点击未读消息定位按钮"
    params:
      conversation_type: "private" | "group"
      button_type: "history" | "realtime" | "mention"
      unread_count: integer

  - id: EVT-003
    name: "im_unread_scroll_manual"
    trigger: "用户手动滑动到未读消息（未使用按钮）"
    params:
      conversation_type: "private" | "group"

  # === @功能 ===
  - id: EVT-004
    name: "im_mention_trigger"
    trigger: "触发@功能"
    params:
      trigger_type: "input_at" | "long_press_avatar"
      conversation_id: string

  - id: EVT-005
    name: "im_mention_select"
    trigger: "选择@对象"
    params:
      mention_type: "user" | "all"
      conversation_id: string

  - id: EVT-006
    name: "im_mention_send"
    trigger: "发送含@的消息"
    params:
      mention_count: integer          # 本条消息@了几人
      has_mention_all: boolean
      conversation_id: string

  - id: EVT-007
    name: "im_mention_received"
    trigger: "收到@消息（被@方）"
    params:
      mention_type: "user" | "all"
      conversation_id: string

  - id: EVT-008
    name: "im_mention_locate_click"
    trigger: "点击@定位按钮"
    params:
      mention_count: integer
      conversation_id: string

  # === 通知设置 ===
  - id: EVT-009
    name: "im_notification_setting_change"
    trigger: "修改群通知设置"
    params:
      from_level: NotificationLevel
      to_level: NotificationLevel
      conversation_id: string
```

---

## 8. 边界条件与异常处理

```yaml
edge_cases:
  # === 未读消息定位 ===
  - id: EC-001
    scenario: "未读消息数为0"
    condition: "unread_count === 0"
    expected: "不显示任何定位按钮"
    priority: must

  - id: EC-002
    scenario: "未读消息在可视区域内"
    condition: "firstUnreadMessage在当前屏幕可见范围"
    expected: "不显示历史未读按钮"
    priority: must

  - id: EC-003
    scenario: "未读数超过99"
    condition: "unread_count > 99"
    expected: "按钮显示 '99+ New Messages'"
    priority: must

  - id: EC-004
    scenario: "快速进出聊天页面"
    condition: "进入后立即退出"
    expected: "未读状态重置为已读，下次进入不再显示按钮"
    priority: must

  - id: EC-005
    scenario: "双按钮同时存在时点击其中一个"
    condition: "历史未读按钮 + 实时新消息按钮同时显示"
    expected: "点击一个按钮后，另一个按钮不受影响仍保持显示"
    priority: must

  - id: EC-006
    scenario: "网络断开时收到本地缓存的未读"
    condition: "offline状态"
    expected: "按钮基于本地缓存数据展示，恢复网络后刷新"
    priority: should

  # === @功能 ===
  - id: EC-007
    scenario: "@昵称包含特殊字符"
    condition: "nickname含有emoji或特殊符号"
    expected: "正常展示和高亮，不截断不乱码"
    priority: must

  - id: EC-008
    scenario: "输入框字数达到上限时继续@"
    condition: "content.length >= max_length"
    expected: "无法选中更多成员，toast: '已超过最大字数限制'"
    priority: must

  - id: EC-009
    scenario: "被@用户已退群"
    condition: "mention.user_id 不在群成员列表中"
    expected: "@昵称正常展示但不可点击跳转（用户不存在）"
    priority: should

  - id: EC-010
    scenario: "群成员列表为空或只有自己"
    condition: "members.filter(m => m.user_id !== me).length === 0"
    expected: "@列表展示空状态，提示'暂无可@成员'"
    priority: must

  - id: EC-011
    scenario: "长按自己的头像"
    condition: "长按的是自己的头像"
    expected: "不触发@功能（不能@自己）"
    priority: must

  - id: EC-012
    scenario: "同一条消息@同一人多次"
    condition: "mentions中有重复user_id"
    expected: "允许，每次@都独立展示和高亮"
    priority: should

  - id: EC-013
    scenario: "删除消息中的@昵称部分文字"
    condition: "用户在输入框中删除@昵称的部分字符"
    expected: "整个@标记（@+昵称）作为整体删除，不允许部分编辑"
    priority: must

  # === 通知设置 ===
  - id: EC-014
    scenario: "设置'有人@我'后收到普通消息"
    condition: "notification_level === 'mention_only' && message.mentions为空"
    expected: "不触发Push通知，不触发在线通知，但会话列表正常显示未读数"
    priority: must

  - id: EC-015
    scenario: "设置'都不通知'后被@"
    condition: "notification_level === 'none' && 被@"
    expected: "不触发任何通知（Push/在线均不触发），但会话列表显示未读数和@标识"
    priority: must

  # === 按钮优先级 ===
  - id: EC-016
    scenario: "同时有历史未读和被@消息"
    condition: "history_unread_count > 0 && mention_count > 0"
    expected: "右上角只显示@按钮，不显示历史未读按钮"
    priority: must

  - id: EC-017
    scenario: "实时新消息中包含@消息"
    condition: "新消息中有@当前用户的消息"
    expected: "只显示实时新消息按钮，不额外显示@按钮"
    priority: must
```

---

## 9. 测试验收标准

```yaml
test_cases:
  # === 未读消息定位 ===
  - id: TC-001
    story_ref: US-001
    category: functional
    title: "历史未读按钮-正常展示"
    precondition: "会话有20条未读消息，超出可视区域"
    steps:
      - "进入聊天页面"
    expected: "右上角显示 '20 New Messages' 按钮"

  - id: TC-002
    story_ref: US-001
    category: functional
    title: "历史未读按钮-点击跳转"
    precondition: "历史未读按钮已显示"
    steps:
      - "点击历史未读按钮"
    expected: "自动滚动到最早未读消息，消息上方显示 'New Messages' 分割线，按钮消失"

  - id: TC-003
    story_ref: US-001
    category: functional
    title: "历史未读按钮-手动滑动消失"
    precondition: "历史未读按钮已显示"
    steps:
      - "手动向上滑动到最早未读消息位置"
    expected: "按钮消失，不显示分割线"

  - id: TC-004
    category: functional
    title: "实时新消息按钮-展示与跳转"
    precondition: "用户停留在聊天页面，已向上滑动离开底部"
    steps:
      - "对方发送3条新消息"
      - "点击右下角新消息按钮"
    expected: "按钮显示 '3 New Messages'，点击后跳转到最新消息，按钮消失"

  - id: TC-005
    edge_case_ref: EC-005
    category: functional
    title: "双按钮共存"
    precondition: "有历史未读 + 用户已离开底部 + 收到新消息"
    steps:
      - "观察页面"
      - "点击历史未读按钮"
    expected: "两个按钮同时显示；点击历史未读按钮后该按钮消失，实时新消息按钮仍在"

  # === @功能 ===
  - id: TC-006
    story_ref: US-002
    category: functional
    title: "长按头像触发@"
    precondition: "在群聊页面"
    steps:
      - "长按某成员头像"
    expected: "输入框自动唤起，插入 '@用户昵称 '"

  - id: TC-007
    story_ref: US-002
    category: functional
    title: "输入@唤起列表"
    precondition: "在群聊页面，输入框获得焦点"
    steps:
      - "输入 '@'"
    expected: "弹出@成员选择列表，不包含自己"

  - id: TC-008
    story_ref: US-003
    category: functional
    title: "群主@所有人"
    precondition: "当前用户为群主"
    steps:
      - "输入 '@'"
      - "选择'所有人'"
      - "发送消息"
    expected: "@列表第一位为'所有人'，选择后插入'@所有人'，发送成功"

  - id: TC-009
    story_ref: US-003
    category: functional
    title: "普通成员无@所有人权限"
    precondition: "当前用户为普通成员"
    steps:
      - "输入 '@'"
    expected: "@列表不展示'所有人'选项"

  - id: TC-010
    story_ref: US-004
    category: functional
    title: "被@通知展示"
    precondition: "用户不在该群聊页面"
    steps:
      - "其他用户在群内@当前用户"
    expected: "会话列表该群显示红色@标识 + '[nickname] mention you：消息内容'"

  - id: TC-011
    story_ref: US-004
    category: functional
    title: "@消息定位按钮"
    precondition: "有被@的历史消息超出可视区域"
    steps:
      - "进入群聊页面"
      - "点击@定位按钮"
    expected: "显示 'N New mention' 按钮，点击后跳转到最早被@消息并高亮"

  - id: TC-012
    edge_case_ref: EC-008
    category: edge_case
    title: "字数超限时@"
    precondition: "输入框已接近字数上限"
    steps:
      - "输入@并尝试选择成员"
    expected: "无法选中，toast提示'已超过最大字数限制'"

  - id: TC-013
    edge_case_ref: EC-013
    category: edge_case
    title: "@昵称整体删除"
    precondition: "输入框已有 '@用户A 你好'"
    steps:
      - "光标移到'@用户A'中间，按删除键"
    expected: "'@用户A'整体被删除，剩余' 你好'"

  # === 通知设置 ===
  - id: TC-014
    story_ref: US-005
    category: functional
    title: "设置有人@我通知"
    precondition: "群通知当前为'全部'"
    steps:
      - "点击群设置中的'通知'按钮"
      - "选择'有人@我'"
      - "其他用户发送普通消息"
      - "其他用户@当前用户"
    expected: "普通消息不触发通知；@消息触发Push通知"

  - id: TC-015
    edge_case_ref: EC-016
    category: edge_case
    title: "按钮优先级-@优先于未读"
    precondition: "有历史未读消息 + 有被@消息"
    steps:
      - "进入群聊页面"
    expected: "右上角只显示@定位按钮，不显示历史未读按钮"

  # === 性能 ===
  - id: TC-016
    category: performance
    title: "大量未读消息定位性能"
    precondition: "会话有500+未读消息"
    steps:
      - "点击历史未读按钮"
    expected: "跳转完成时间 < 500ms，无卡顿"

  - id: TC-017
    category: performance
    title: "大群@列表加载性能"
    precondition: "群成员500+"
    steps:
      - "输入@唤起列表"
    expected: "列表展示时间 < 300ms，滑动流畅"
```

---

## 10. 技术备注

```yaml
tech_notes:
  architecture: "MVVM"
  platform: "iOS(Swift) + Android(Kotlin)"

  # === 未读消息定位实现要点 ===
  unread_positioning:
    - "未读消息ID通过本地DB记录的last_read_msg_id计算"
    - "进入会话时一次性获取unread_info，history按钮count为固定值"
    - "实时新消息通过WebSocket推送，count动态递增"
    - "跳转实现：根据msg_id计算在列表中的offset，scrollToOffset"
    - "若目标消息不在本地缓存，需先拉取历史消息再跳转"
    - "分割线(NewMessageDivider)仅在内存中标记，不持久化"

  # === @功能实现要点 ===
  mention_implementation:
    - "@标记在输入框中作为整体(atomic)处理，不可部分编辑"
    - "实现方式：iOS用NSAttributedString + NSTextAttachment; Android用SpannableString + ImageSpan或自定义Span"
    - "消息发送时，mentions数组随消息体一起发送"
    - "消息渲染时，根据mentions中的offset+length做富文本高亮"
    - "@所有人的user_id传特殊值(如'all')，后端负责扩散通知"

  # === 通知实现要点 ===
  notification:
    - "通知级别存储在本地 + 服务端双份"
    - "Push通知由服务端根据用户设置决定是否下发"
    - "在线通知(app内)由客户端本地根据设置过滤"
    - "会话列表的未读数和@标识不受通知设置影响，始终展示"

  # === WebSocket事件 ===
  websocket_events:
    - event: "new_message"
      description: "新消息推送"
      payload: "ChatMessage"
      action: "更新realtime_new_count，判断是否含@"
    - event: "mention_notification"
      description: "被@通知"
      payload: "MentionNotification"
      action: "更新mention_count，展示@按钮"

  caveats:
    - "历史未读按钮的count是进入页面时的快照，不随新消息变化"
    - "实时新消息按钮的count随新消息动态递增"
    - "@列表需过滤掉自己（不能@自己）"
    - "长按头像@不弹列表，直接插入，这是两种不同的触发路径"
    - "退出聊天页面时，未读状态重置为已读（无论是否点击了定位按钮）"
    - "被@消息的高亮是临时效果，滑动离开后消失"
    - "iOS画中画场景下收到@消息，需在画中画上也展示小红点"

  reuse_existing:
    - component: "MessageBubble"
      note: "已有消息气泡组件，在其中增加mentions高亮渲染逻辑"
    - component: "ChatInputBar"
      note: "已有输入框组件，需扩展支持@标记的原子操作"
    - component: "MemberListItem"
      note: "已有成员列表项组件，@列表复用"
```

---

## 多语言Key对照

```yaml
i18n_keys:
  - key: "message_new_msg_segmentation"
    value: "New Messages"
    usage: "分割线文案"

  - key: "message_new_msg_jump_one"
    value: "1 New Message"
    usage: "单条未读按钮文案"

  - key: "message_new_msg_jump"
    value: "[num] New Messages"
    usage: "多条未读按钮文案"

  - key: "message_new_mention_jump"
    value: "1 New mention"
    usage: "单条@按钮文案"

  - key: "message_new_mention_jump_num"
    value: "[num] New mentions"
    usage: "多条@按钮文案"

  - key: "message_everyone"
    value: "所有人"
    usage: "@所有人选项"

  - key: "message_mention_text"
    value: "[nickname] mention you"
    usage: "被@消息预览"

  - key: "dynamic_character_limit_exceeded"
    value: "已超过最大字数限制"
    usage: "字数超限toast"
```

---

## 变更记录

| 版本 | 日期 | 作者 | 变更内容 |
|------|------|------|----------|
| 1.0 | 2026-06-15 | AI重构 | 基于原始PRD重构为AI可读结构化格式 |
