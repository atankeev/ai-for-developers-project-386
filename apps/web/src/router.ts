import { createRouter, createWebHistory } from 'vue-router';
import GuestPage from './GuestPage.vue';
import OwnerLayout from './owner/OwnerLayout.vue';
import OwnerLogin from './owner/OwnerLogin.vue';
import OwnerSection from './owner/OwnerSection.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: GuestPage },
    { path: '/book', component: GuestPage },
    { path: '/owner/login', component: OwnerLogin },
    {
      path: '/owner',
      component: OwnerLayout,
      children: [
        { path: '', redirect: '/owner/bookings' },
        { path: 'bookings', component: OwnerSection, meta: { title: 'Встречи' } },
        { path: 'meeting-types', component: OwnerSection, meta: { title: 'Типы встреч' } },
        { path: 'schedule', component: OwnerSection, meta: { title: 'Расписание' } },
      ],
    },
  ],
});
