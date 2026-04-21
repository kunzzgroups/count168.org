document.addEventListener('DOMContentLoaded', function () {
    // 确保这段逻辑哪怕文件被多次引入也能正常运行且不重复绑定
    if (window._sharedCompanyFilterInitialized) return;
    window._sharedCompanyFilterInitialized = true;

    const groupBtns = document.querySelectorAll('.shared-group-btn');
    const companyBtns = document.querySelectorAll('.shared-company-btn');

    // 处理当前选中组的状态
    const activeGroupBtn = document.querySelector('.shared-group-btn.active');
    let currentSelectedGroup = activeGroupBtn ? activeGroupBtn.getAttribute('data-group-id') : null;

    // 与 Dashboard 同步状态
    // 如果 sessionStorage 里面有记录，而且和当前服务器 active 的不一样，为了避免首次闪烁我们暂时不管
    // 只有在用户点击时才更新 session

    groupBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const clickedGroup = this.getAttribute('data-group-id');

            if (currentSelectedGroup === clickedGroup) {
                // 点击已选中的 Group -> 取消选中
                currentSelectedGroup = null;
                sessionStorage.removeItem('dashboard_group_filter');
                groupBtns.forEach(b => b.classList.remove('active'));

                // 呈现没有 Group 的独立公司
                companyBtns.forEach(cBtn => {
                    const cGroupId = cBtn.getAttribute('data-group-id');
                    if (!cGroupId || cGroupId.trim() === '') {
                        cBtn.style.display = '';
                    } else {
                        cBtn.style.display = 'none';
                    }
                });

                triggerFirstVisibleCompany();
            } else {
                // 选中新的 Group
                currentSelectedGroup = clickedGroup;
                sessionStorage.setItem('dashboard_group_filter', currentSelectedGroup);

                groupBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                // 呈现对应 Group 的公司
                companyBtns.forEach(cBtn => {
                    const cGroupId = cBtn.getAttribute('data-group-id');
                    if (cGroupId === currentSelectedGroup) {
                        cBtn.style.display = '';
                    } else {
                        cBtn.style.display = 'none';
                    }
                });

                triggerFirstVisibleCompany();
            }
        });
    });

    companyBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            // 被隐藏的公司按钮不能被点击
            if (this.style.display === 'none') return;

            const companyId = this.getAttribute('data-company-id');
            const companyCode = this.getAttribute('data-company-code');

            // 更新 UI 状态
            companyBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // 触发全局回调 (供外部模块重写或接管)
            if (typeof window.onSharedCompanyFilterChanged === 'function') {
                window.onSharedCompanyFilterChanged(companyId, companyCode);
            }
        });
    });

    function triggerFirstVisibleCompany() {
        let firstVisible = null;
        for (let i = 0; i < companyBtns.length; i++) {
            if (companyBtns[i].style.display !== 'none') {
                firstVisible = companyBtns[i];
                break;
            }
        }

        if (firstVisible) {
            companyBtns.forEach(b => b.classList.remove('active'));
            firstVisible.classList.add('active');

            const companyId = firstVisible.getAttribute('data-company-id');
            const companyCode = firstVisible.getAttribute('data-company-code');
            
            if (typeof window.onSharedCompanyFilterChanged === 'function') {
                window.onSharedCompanyFilterChanged(companyId, companyCode);
            }
        } else {
            // 如果该分组下没有任何公司（或者由于只有独立公司的情况下被选中），可以触发一下空 id 回调清理列表
            if (typeof window.onSharedCompanyFilterChanged === 'function') {
                window.onSharedCompanyFilterChanged(null, null);
            }
        }
    }
});
